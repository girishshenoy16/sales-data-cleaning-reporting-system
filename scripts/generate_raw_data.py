import csv
import random
from datetime import datetime, timedelta
import os

def generate_raw_sales_data(output_path, num_rows=105000):
    # Ensure directory exists
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    
    # Base data definitions
    regions_states = {
        "North": ["NY", "PA", "MA", "NJ", "IL", "OH", "MI", "IN"],
        "South": ["TX", "FL", "GA", "NC", "VA", "TN"],
        "East": ["NY", "PA", "MA", "NJ", "DE", "MD"],
        "West": ["CA", "WA", "OR", "AZ", "CO", "UT"]
    }
    
    region_typos = {
        "North": ["North", "north", "N. Region", "NORTH"],
        "South": ["South", "south", "S. Region", "SOUTH"],
        "East": ["East", "east", "E. Region", "EAST"],
        "West": ["West", "west", "W. Region", "WEST"]
    }
    
    categories_products = {
        "Technology": [
            ("Laptop", 1200), ("Smartphone", 800), ("Headphones", 150), 
            ("Tablet", 400), ("Monitor", 300), ("Keyboard", 50)
        ],
        "Furniture": [
            ("Office Chair", 250), ("Desk", 350), ("Bookshelf", 180), 
            ("Sofa", 600), ("Filing Cabinet", 150), ("Table", 200)
        ],
        "Office Supplies": [
            ("Paper Pack", 15), ("Binder", 8), ("Pens Set", 5), 
            ("Stapler", 12), ("Whiteboard", 80), ("Calculator", 25)
        ]
    }
    
    category_typos = {
        "Technology": ["Technology", "Tech", "techno", "TECHNOLOGY"],
        "Furniture": ["Furniture", "furni", "FURNITURE", "Furnitures"],
        "Office Supplies": ["Office Supplies", "Office Supp", "OFFICE SUPPLIES", "Off. Supplies"]
    }
    
    customers = [
        (f"CUST-{10000 + i}", f"Customer {10000 + i}") for i in range(1, 10000)
    ]
    
    reps = ["Alice Smith", "Bob Jones", "Charlie Brown", "David Miller", "Emma Wilson", "Frank Thomas"]
    payment_methods = ["Credit Card", "PayPal", "Bank Transfer", "Debit Card"]
    delivery_statuses = ["Delivered", "Shipped", "Pending", "Cancelled"]
    
    # Date helper
    start_date = datetime(2025, 1, 1)
    
    headers = [
        "Order ID", "Customer ID", "Customer Name", "Order Date", "Region", "State", 
        "Product Category", "Product Name", "Quantity Sold", "Unit Price", "Sales Amount", 
        "Discount %", "Profit Amount", "Sales Representative", "Payment Method", "Delivery Status"
    ]
    
    # Generate records in memory first to easily inject duplicate rows
    records = []
    
    print(f"Generating {num_rows} raw records...")
    
    for i in range(num_rows):
        # 1. Order ID
        order_id = f"ORD-{2025}-{100000 + i}"
        
        # 2. Customer details
        cust_id, cust_name = random.choice(customers)
        # Inject missing customer name (1.5% probability)
        if random.random() < 0.015:
            cust_name = ""
            
        # 3. Order Date with multiple formats (5% DD/MM/YYYY, 2% textual, rest YYYY-MM-DD)
        random_days = random.randint(0, 500)
        order_date_obj = start_date + timedelta(days=random_days)
        date_rand = random.random()
        if date_rand < 0.05:
            order_date = order_date_obj.strftime("%d/%m/%Y")
        elif date_rand < 0.07:
            months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
            order_date = f"{order_date_obj.day}-{months[order_date_obj.month - 1]}-{order_date_obj.year}"
        else:
            order_date = order_date_obj.strftime("%Y-%m-%d")
            
        # 4. Region & State (with typos)
        region = random.choice(list(regions_states.keys()))
        state = random.choice(regions_states[region])
        # Inject regional typos (5% probability)
        if random.random() < 0.05:
            region_str = random.choice(region_typos[region])
        else:
            region_str = region
            
        # 5. Product Category & Product Name (with typos)
        category = random.choice(list(categories_products.keys()))
        product_info = random.choice(categories_products[category])
        product_name = product_info[0]
        base_price = product_info[1]
        
        if random.random() < 0.05:
            category_str = random.choice(category_typos[category])
        else:
            category_str = category
            
        # 6. Quantity Sold (with nulls, negatives, and outliers)
        qty_rand = random.random()
        if qty_rand < 0.015:
            qty_sold = "" # missing value
        elif qty_rand < 0.025:
            qty_sold = random.randint(-10, -1) # negative value (anomaly)
        elif qty_rand < 0.030:
            qty_sold = random.randint(300, 1000) # outlier (high volume)
        else:
            qty_sold = random.randint(1, 15) # normal range
            
        # 7. Unit Price (with negative prices and massive outliers)
        price_rand = random.random()
        if price_rand < 0.005:
            unit_price = -round(base_price * random.uniform(0.8, 1.2), 2) # negative price (anomaly)
        elif price_rand < 0.010:
            unit_price = round(base_price * random.uniform(20, 50), 2) # massive outlier
        else:
            unit_price = round(base_price * random.uniform(0.9, 1.1), 2) # normal variation
            
        # 8. Discount % (with nulls)
        discount_rand = random.random()
        if discount_rand < 0.02:
            discount = "" # missing value
        else:
            discount = random.choice([0.0, 0.0, 0.05, 0.10, 0.15, 0.20])
            
        # 9. Sales Amount (with calculation errors)
        # Proper formula: Sales = Qty * Price * (1 - Discount)
        try:
            qty_val = float(qty_sold) if qty_sold != "" else 0
            price_val = float(unit_price)
            disc_val = float(discount) if discount != "" else 0
            proper_sales = qty_val * price_val * (1 - disc_val)
        except Exception:
            proper_sales = 0
            
        sales_rand = random.random()
        if sales_rand < 0.04:
            # Inject computation error
            sales_amount = round(proper_sales * random.choice([0.5, 1.5, 2.0]), 2)
        else:
            sales_amount = round(proper_sales, 2)
            
        # 10. Profit Amount (with profit > sales amount or logic errors)
        # Margin profile: Tech ~ 25%, Furniture ~ 15%, Office Supplies ~ 40%
        margin_map = {"Technology": 0.25, "Furniture": 0.15, "Office Supplies": 0.40}
        base_margin = margin_map.get(category, 0.2)
        proper_profit = sales_amount * (base_margin + random.uniform(-0.05, 0.05))
        
        profit_rand = random.random()
        if profit_rand < 0.03:
            # Profit exceeds Sales (impossible anomaly)
            profit_amount = round(abs(sales_amount) * 1.5, 2)
        elif profit_rand < 0.05:
            # Negative profit on normal sales, or vice versa
            profit_amount = -round(abs(proper_profit), 2)
        else:
            profit_amount = round(proper_profit, 2)
            
        # 11. Sales Representative
        rep = random.choice(reps)
        
        # 12. Payment Method (with nulls)
        if random.random() < 0.02:
            pay_method = "" # missing
        else:
            pay_method = random.choice(payment_methods)
            
        # 13. Delivery Status
        delivery = random.choice(delivery_statuses)
        
        records.append([
            order_id, cust_id, cust_name, order_date, region_str, state,
            category_str, product_name, qty_sold, unit_price, sales_amount,
            discount, profit_amount, rep, pay_method, delivery
        ])
        
    # Inject exact duplicates (about 1.5% duplication rate)
    num_duplicates = int(num_rows * 0.015)
    print(f"Injecting {num_duplicates} exact duplicate records...")
    for _ in range(num_duplicates):
        duplicate_record = random.choice(records)
        records.append(duplicate_record.copy())
        
    # Shuffle to mix duplicates
    random.shuffle(records)
    
    # Write to CSV
    with open(output_path, mode="w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(headers)
        writer.writerows(records)
        
    print(f"Successfully generated dataset with {len(records)} rows at '{output_path}'.")

if __name__ == "__main__":
    generate_raw_sales_data("data/raw_sales_data.csv")
