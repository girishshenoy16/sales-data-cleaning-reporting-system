import pandas as pd
import numpy as np
import json
import os

def clean_sales_data(raw_path, cleaned_path, json_path):
    print("Starting ETL & Data Cleaning Pipeline...")
    
    # 1. Load Raw Data
    if not os.path.exists(raw_path):
        raise FileNotFoundError(f"Raw data file not found at {raw_path}. Run generate_raw_data.py first.")
        
    df = pd.read_csv(raw_path)
    raw_row_count = len(df)
    print(f"Loaded raw dataset with {raw_row_count} rows and {len(df.columns)} columns.")
    
    # Track cleaning stats
    stats = {
        "raw_records": raw_row_count,
        "duplicates_removed": 0,
        "nulls_customer_name_filled": 0,
        "nulls_discount_filled": 0,
        "nulls_payment_filled": 0,
        "nulls_quantity_imputed": 0,
        "typos_region_fixed": 0,
        "typos_category_fixed": 0,
        "dates_standardized": 0,
        "negative_qty_corrected": 0,
        "negative_price_corrected": 0,
        "price_outliers_capped": 0,
        "calculation_errors_corrected": 0,
        "profit_errors_corrected": 0
    }
    
    # --- STEP 1: Duplicate Detection & Removal ---
    # Find exact duplicate rows
    duplicate_mask = df.duplicated()
    stats["duplicates_removed"] = int(duplicate_mask.sum())
    df = df.drop_duplicates().reset_index(drop=True)
    print(f"Removed {stats['duplicates_removed']} exact duplicate records. Remaining rows: {len(df)}.")
    
    # --- STEP 2: Standardize Dates ---
    print("Standardizing date formats...")
    original_dates = df["Order Date"].copy()
    df["Order Date"] = pd.to_datetime(df["Order Date"], errors="coerce", format="mixed")
    
    # Any null dates left? Fill using forward fill and backward fill
    if df["Order Date"].isnull().any():
        df["Order Date"] = df["Order Date"].ffill().bfill()
        
    # Count standardized dates
    has_slash = original_dates.str.contains("/", na=False)
    has_text = original_dates.str.contains("-Jan|-Feb|-Mar|-Apr|-May|-Jun|-Jul|-Aug|-Sep|-Oct|-Nov|-Dec", na=False)
    stats["dates_standardized"] = int((has_slash | has_text).sum())
    print(f"Standardized {stats['dates_standardized']} date values to YYYY-MM-DD format.")
    
    # Format date as string YYYY-MM-DD for consistency
    df["Order Date"] = df["Order Date"].dt.strftime("%Y-%m-%d")
    
    # --- STEP 3: Standardize Text Fields (Typos & Inconsistencies) ---
    print("Cleaning and standardizing text columns...")
    
    # Clean Region
    original_regions = df["Region"].copy()
    def clean_region(val):
        if not isinstance(val, str):
            return "Unknown"
        val_lower = val.strip().lower()
        if "north" in val_lower or val_lower == "ne" or val_lower.startswith("n."):
            return "North"
        if "south" in val_lower or val_lower == "se" or val_lower.startswith("s."):
            return "South"
        if "east" in val_lower or val_lower.startswith("e."):
            return "East"
        if "west" in val_lower or val_lower.startswith("w."):
            return "West"
        return val.strip().capitalize()
        
    df["Region"] = df["Region"].apply(clean_region)
    stats["typos_region_fixed"] = int((df["Region"] != original_regions).sum())
    print(f"Fixed {stats['typos_region_fixed']} inconsistent region names.")
    
    # Clean Product Category
    original_categories = df["Product Category"].copy()
    def clean_category(val):
        if not isinstance(val, str):
            return "Office Supplies"
        val_lower = val.strip().lower()
        if "tech" in val_lower:
            return "Technology"
        if "furn" in val_lower:
            return "Furniture"
        if "offic" in val_lower or "supp" in val_lower:
            return "Office Supplies"
        return "Office Supplies"
        
    df["Product Category"] = df["Product Category"].apply(clean_category)
    stats["typos_category_fixed"] = int((df["Product Category"] != original_categories).sum())
    print(f"Fixed {stats['typos_category_fixed']} product category spellings/typos.")
    
    # Clean State
    df["State"] = df["State"].astype(str).str.strip().str.upper()
    
    # --- STEP 4: Handle Missing Values (Imputation) ---
    print("Handling missing values...")
    
    # Customer Name
    null_cust_name = df["Customer Name"].isnull() | (df["Customer Name"] == "")
    stats["nulls_customer_name_filled"] = int(null_cust_name.sum())
    df["Customer Name"] = df["Customer Name"].fillna("Guest Customer")
    df.loc[df["Customer Name"] == "", "Customer Name"] = "Guest Customer"
    
    # Payment Method
    null_payment = df["Payment Method"].isnull() | (df["Payment Method"] == "")
    stats["nulls_payment_filled"] = int(null_payment.sum())
    df["Payment Method"] = df["Payment Method"].fillna("Unspecified")
    df.loc[df["Payment Method"] == "", "Payment Method"] = "Unspecified"
    
    # Discount %
    null_discount = df["Discount %"].isnull()
    stats["nulls_discount_filled"] = int(null_discount.sum())
    df["Discount %"] = df["Discount %"].fillna(0.0)
    
    # Quantity Sold (Missing values & Negative Values)
    null_qty = df["Quantity Sold"].isnull()
    stats["nulls_quantity_imputed"] = int(null_qty.sum())
    median_qty = df["Quantity Sold"].median()
    if pd.isna(median_qty) or median_qty <= 0:
        median_qty = 5
    df["Quantity Sold"] = df["Quantity Sold"].fillna(median_qty)
    
    # --- STEP 5: Numerical Auditing (Negatives, Outliers, Calculations) ---
    print("Auditing numerical columns and correcting calculations...")
    
    # Quantity Sold (Correct negative values to absolute)
    neg_qty = df["Quantity Sold"] < 0
    stats["negative_qty_corrected"] = int(neg_qty.sum())
    df["Quantity Sold"] = df["Quantity Sold"].abs().astype(int)
    
    # Unit Price (Correct negative prices)
    neg_price = df["Unit Price"] < 0
    stats["negative_price_corrected"] = int(neg_price.sum())
    df["Unit Price"] = df["Unit Price"].abs()
    
    # Outlier Detection on Unit Price (using a category-specific threshold to cap outliers)
    category_caps = {
        "Technology": 3000.0,
        "Furniture": 1500.0,
        "Office Supplies": 200.0
    }
    
    outlier_prices = df.apply(lambda row: row["Unit Price"] > category_caps.get(row["Product Category"], 2000.0), axis=1)
    stats["price_outliers_capped"] = int(outlier_prices.sum())
    
    # Cap price to the median price of that product category
    category_medians = df.groupby("Product Category")["Unit Price"].median().to_dict()
    
    def cap_price(row):
        cat = row["Product Category"]
        cap = category_caps.get(cat, 2000.0)
        price = row["Unit Price"]
        if price > cap:
            return category_medians.get(cat, price)
        return price
        
    df["Unit Price"] = df.apply(cap_price, axis=1)
    print(f"Capped {stats['price_outliers_capped']} extreme unit price outliers.")
    
    # Recalculate Sales Amount to ensure accuracy: Qty * Price * (1 - Discount)
    df["Quantity Sold"] = df["Quantity Sold"].astype(int)
    proper_sales = df["Quantity Sold"] * df["Unit Price"] * (1 - df["Discount %"])
    proper_sales = proper_sales.round(2)
    
    calc_errors = (df["Sales Amount"] - proper_sales).abs() > 0.02
    stats["calculation_errors_corrected"] = int(calc_errors.sum())
    df["Sales Amount"] = proper_sales
    print(f"Corrected {stats['calculation_errors_corrected']} sales amount calculation errors.")
    
    # Audit Profit Amount
    margin_map = {"Technology": 0.25, "Furniture": 0.15, "Office Supplies": 0.40}
    
    def audit_profit(row):
        sales = row["Sales Amount"]
        profit = row["Profit Amount"]
        cat = row["Product Category"]
        base_margin = margin_map.get(cat, 0.2)
        
        if profit > sales or profit < -sales:
            return round(sales * base_margin, 2)
        return profit
        
    original_profit = df["Profit Amount"].copy()
    df["Profit Amount"] = df.apply(audit_profit, axis=1)
    stats["profit_errors_corrected"] = int((df["Profit Amount"] != original_profit).sum())
    print(f"Corrected {stats['profit_errors_corrected']} profit calculation anomalies.")
    
    # Save Cleaned CSV
    os.makedirs(os.path.dirname(cleaned_path), exist_ok=True)
    df.to_csv(cleaned_path, index=False)
    print(f"Saved clean dataset to '{cleaned_path}'. Remaining rows: {len(df)}.")
    
    # --- STEP 6: Pre-Aggregate for Web Dashboard (Multidimensional Cube) ---
    print("Generating pre-aggregated multidimensional data cube...")
    
    # Add Month column
    df["Month"] = pd.to_datetime(df["Order Date"]).dt.to_period("M").astype(str)
    
    # Group by dimensions used by the dashboard filters
    cube_df = df.groupby([
        "Month", "Region", "Product Category", "Sales Representative", "Delivery Status", "Payment Method"
    ]).agg(
        Sales=("Sales Amount", "sum"),
        Profit=("Profit Amount", "sum"),
        Orders=("Order ID", "nunique"),
        Customers=("Customer ID", "nunique")
    ).reset_index()
    
    # Round metrics
    cube_df["Sales"] = cube_df["Sales"].round(2)
    cube_df["Profit"] = cube_df["Profit"].round(2)
    
    cube_list = cube_df.to_dict(orient="records")
    print(f"Generated data cube with {len(cube_list)} unique dimension combinations.")
    
    # Global KPIs
    total_sales = float(df["Sales Amount"].sum())
    total_profit = float(df["Profit Amount"].sum())
    total_orders = int(df["Order ID"].nunique())
    total_customers = int(df["Customer ID"].nunique())
    avg_order_value = float(total_sales / total_orders) if total_orders > 0 else 0.0
    profit_margin = float(total_profit / total_sales * 100) if total_sales > 0 else 0.0
    
    # Calculate Data Health Score
    total_errors_cleaned = sum([
        stats["duplicates_removed"],
        stats["nulls_customer_name_filled"],
        stats["nulls_discount_filled"],
        stats["nulls_payment_filled"],
        stats["nulls_quantity_imputed"],
        stats["typos_region_fixed"],
        stats["typos_category_fixed"],
        stats["dates_standardized"],
        stats["negative_qty_corrected"],
        stats["negative_price_corrected"],
        stats["price_outliers_capped"],
        stats["calculation_errors_corrected"],
        stats["profit_errors_corrected"]
    ])
    
    total_cells = raw_row_count * 16
    health_index = round((1 - (total_errors_cleaned / total_cells)) * 100, 2)
    
    kpis = {
        "total_sales": round(total_sales, 2),
        "total_profit": round(total_profit, 2),
        "total_orders": total_orders,
        "total_customers": total_customers,
        "avg_order_value": round(avg_order_value, 2),
        "profit_margin_pct": round(profit_margin, 2),
        "health_index": health_index,
        "total_errors_cleaned": total_errors_cleaned
    }
    
    # Compile dashboard payload matching app.js expectations
    dashboard_payload = {
        "kpis": kpis,
        "quality_stats": stats,
        "cube": cube_list
    }
    
    # Write JSON to docs/
    os.makedirs(os.path.dirname(json_path), exist_ok=True)
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(dashboard_payload, f, indent=4)
            
    print(f"Generated web dashboard data at '{json_path}'. Health Score: {health_index}%.")
    print("ETL & Cleaning Pipeline completed successfully!")

if __name__ == "__main__":
    clean_sales_data(
        raw_path="data/raw_sales_data.csv",
        cleaned_path="data/cleaned_sales_data.csv",
        json_path="docs/dashboard_data.json"
    )
