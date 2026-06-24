const PINK='#FF3F6C', PINKD='#D81B5F', INK='#0D0D0D', SAGE='#4F7A5C', AMBER='#D98C00', RED='#C9372C', BLUE='#5C8FB8', MUTED='#7A7066';

let RAW = null;        // full payload from dashboard_data.json
let CUBE = [];          // data.cube
let CHARTS = {};

// ---------- LOAD ----------
async function loadData(){
  const overlay = document.getElementById('loading-overlay');
  const loadingText = document.getElementById('loading-text');
  try{
    const res = await fetch('dashboard_data.json');
    if(!res.ok) throw new Error('HTTP '+res.status);
    RAW = await res.json();
    CUBE = RAW.cube || [];
    loadingText.textContent = `Loaded ${CUBE.length.toLocaleString('en-IN')} cube rows`;
    renderAll();
    setTimeout(()=> overlay.classList.add('hidden'), 250);
  }catch(err){
    overlay.innerHTML = `<div class="load-error">
      Could not load <b>dashboard_data.json</b>. Make sure it sits in the same folder as index.html, then reload this page.<br><br>
      <span style="font-family:'JetBrains Mono',monospace;font-size:11px;">${err.message}</span>
    </div>`;
    console.error('Dashboard data load failed:', err);
  }
}

// ---------- FILTER STATE ----------
function getFilters(){
  return {
    region:   document.getElementById('f-region').value,
    category: document.getElementById('f-cat').value,
    rep:      document.getElementById('f-rep').value,
    status:   document.getElementById('f-status').value,
    payment:  document.getElementById('f-payment').value
  };
}

function applyFilters(rows, f){
  return rows.filter(r=>
    (!f.region   || r['Region'] === f.region) &&
    (!f.category || r['Product Category'] === f.category) &&
    (!f.rep      || r['Sales Representative'] === f.rep) &&
    (!f.status   || r['Delivery Status'] === f.status) &&
    (!f.payment  || r['Payment Method'] === f.payment)
  );
}

// ---------- AGGREGATION HELPERS ----------
function groupSum(rows, keyFn, valFn){
  const map = new Map();
  rows.forEach(r=>{
    const k = keyFn(r);
    const v = valFn(r);
    map.set(k, (map.get(k)||0) + v);
  });
  return map;
}

function sumField(rows, field){
  return rows.reduce((acc,r)=> acc + (r[field]||0), 0);
}

function fmt(v){
  if(Math.abs(v) >= 10000000) return '₹'+(v/10000000).toFixed(2)+'Cr';
  if(Math.abs(v) >= 100000) return '₹'+(v/100000).toFixed(1)+'L';
  return '₹'+Math.round(v).toLocaleString('en-IN');
}
function pct(v){ return v.toFixed(2)+'%'; }

// ---------- MAIN RENDER ----------
function renderAll(){
  const f = getFilters();
  const rows = applyFilters(CUBE, f);

  updateFilterMeta(f, rows);
  renderKPIs(rows);
  renderCoverStats(rows);
  renderRevenueMarginSection(rows);
  renderGeoSection(rows);
  renderAnomalySection(rows);
  renderTeamSection(rows);
}

function updateFilterMeta(f, rows){
  const meta = document.getElementById('filter-meta');
  const active = Object.values(f).filter(Boolean).length;
  if(active === 0){
    meta.textContent = `Showing all ${rows.length.toLocaleString('en-IN')} cube rows`;
    meta.classList.remove('has-filter');
  } else {
    meta.innerHTML = `
        ${active} filter${active>1?'s':''} active — <br>
        ${rows.length.toLocaleString('en-IN')} rows match
     `;
    meta.classList.add('has-filter');
  }
}

// ---------- COVER ----------
function renderCoverStats(rows){
  const sales = sumField(rows,'Sales');
  const profit = sumField(rows,'Profit');
  const orders = sumField(rows,'Orders');
  const margin = sales>0 ? (profit/sales*100) : 0;
  const cancelledOrders = sumField(rows.filter(r=>r['Delivery Status']==='Cancelled'),'Orders');
  const cancelRate = orders>0 ? (cancelledOrders/orders*100) : 0;

  document.getElementById('stat-orders').textContent = orders.toLocaleString('en-IN');
  document.getElementById('stat-sales').textContent = fmt(sales);
  document.getElementById('stat-profit').textContent = fmt(profit);
  document.getElementById('stat-margin').textContent = pct(margin);
  document.getElementById('stat-cancel').textContent = pct(cancelRate);
}

// ---------- KPI (uses same numbers as cover, kept separate for clarity if markup grows) ----------
function renderKPIs(rows){
  // currently surfaced via cover stats + stat-card-grid; kept as a hook for future KPI row
}

// ---------- I. REVENUE & MARGIN ----------
function renderRevenueMarginSection(rows){
  // Monthly trend
  const monthMap = groupSum(rows, r=>r['Month'], r=>r['Sales']);
  const months = [...monthMap.keys()].sort();
  const monthVals = months.map(m=>monthMap.get(m));
  const cutoffIdx = months.findIndex(m=>m >= '2026-06');

  renderChart('chart-monthly','line',{
    labels: months,
    datasets:[{
      data: monthVals,
      borderColor:PINK,
      backgroundColor:'rgba(255,63,108,0.07)',
      fill:true, tension:.35,
      pointRadius: monthVals.map((v,i)=> (cutoffIdx>=0 && i>=cutoffIdx-1) ? 5 : 3),
      pointBackgroundColor: monthVals.map((v,i)=> (cutoffIdx>=0 && i>=cutoffIdx) ? 'rgba(122,112,102,0.6)' : PINK),
      segment:{
        borderColor: ctx => (cutoffIdx>=0 && ctx.p1DataIndex>=cutoffIdx) ? 'rgba(122,112,102,0.45)' : PINK,
        borderDash: ctx => (cutoffIdx>=0 && ctx.p1DataIndex>=cutoffIdx) ? [6,4] : undefined
      }
    }]
  }, gridOpts(true));

  // Margin by category
  const cats = [...new Set(rows.map(r=>r['Product Category']))].sort();
  const catSales = cats.map(c=> sumField(rows.filter(r=>r['Product Category']===c),'Sales'));
  const catProfit = cats.map(c=> sumField(rows.filter(r=>r['Product Category']===c),'Profit'));
  const catMargin = cats.map((c,i)=> catSales[i]>0 ? catProfit[i]/catSales[i]*100 : 0);
  const order = cats.map((c,i)=>({c,m:catMargin[i],s:catSales[i],p:catProfit[i]})).sort((a,b)=>b.m-a.m);

  renderChart('chart-margin-by-cat','bar',{
    labels: order.map(o=>o.c),
    datasets:[{ data: order.map(o=>o.m), backgroundColor: order.map(o=> o.m>=30?SAGE: o.m>=18?AMBER:RED), borderRadius:5 }]
  }, {...gridOpts(false), indexAxis:'y'});

  // Revenue by category (donut)
  renderChart('chart-rev-by-cat','doughnut',{
    labels: order.map(o=>o.c),
    datasets:[{ data: order.map(o=>o.s), backgroundColor:[PINK,'#2A2A2A',SAGE,AMBER], borderWidth:3, borderColor:'#fff' }]
  }, donutOpts(order.map(o=>o.s)));

  // Profit by category (donut) — different ranking story
  const byProfit = [...order].sort((a,b)=>b.p-a.p);
  renderChart('chart-profit-by-cat','doughnut',{
    labels: byProfit.map(o=>o.c),
    datasets:[{ data: byProfit.map(o=>o.p), backgroundColor:[SAGE,PINK,'#2A2A2A',AMBER], borderWidth:3, borderColor:'#fff' }]
  }, donutOpts(byProfit.map(o=>o.p)));

  // Margin strip (HTML bars, not chart.js)
  renderMarginStrip(order);
}

function renderMarginStrip(order){
  const wrap = document.querySelector('.margin-bars');
  if(!wrap) return;
  const maxMargin = Math.max(...order.map(o=>o.m), 1);
  wrap.innerHTML = order.map(o=>{
    const cls = o.m>=30?'mbar-good': o.m>=18?'mbar-mid':'mbar-low';
    const widthPct = Math.min(100,(o.m/maxMargin)*100);
    return `<div class="mbar-row">
      <span class="mbar-name">${o.c}</span>
      <div class="mbar-track"><div class="mbar-fill ${cls}" style="width:${widthPct}%"></div></div>
      <span class="mbar-pct">${o.m.toFixed(1)}%</span>
    </div>`;
  }).join('');
}

// ---------- II. GEOGRAPHY ----------
function renderGeoSection(rows){
  const regions = [...new Set(rows.map(r=>r['Region']))].sort();
  const regionSales = regions.map(rg=> sumField(rows.filter(r=>r['Region']===rg),'Sales'));

  renderChart('chart-region','doughnut',{
    labels: regions,
    datasets:[{ data: regionSales, backgroundColor:[PINK,SAGE,AMBER,'#2A2A2A'], borderWidth:3, borderColor:'#fff' }]
  }, donutOpts(regionSales));

  // Region x month order trend (lines)
  const months = [...new Set(rows.map(r=>r['Month']))].sort();
  const regionDatasets = regions.map((rg,i)=>{
    const colors=[PINK,SAGE,AMBER,INK];
    const data = months.map(m=> sumField(rows.filter(r=>r['Region']===rg && r['Month']===m),'Orders'));
    return { label:rg, data, borderColor:colors[i%4], backgroundColor:colors[i%4], fill:false, tension:.3, pointRadius:2, borderWidth:2 };
  });
  renderChart('chart-region-trend','line',{ labels: months, datasets: regionDatasets },
    { responsive:true,
      plugins:{ legend:{display:true, position:'bottom', labels:{font:{family:'Inter',size:10}, boxWidth:10}},
        tooltip:{backgroundColor:INK, callbacks:{label:c=>`${c.dataset.label}: ${c.raw.toLocaleString('en-IN')} orders`}} },
      scales:{ y:{ ticks:{font:{family:'Inter',size:10}}, grid:{color:'#EFE6D8'} }, x:{ ticks:{font:{family:'Inter',size:9}}, grid:{display:false} } }
    });

  // AOV by category
  const cats = [...new Set(rows.map(r=>r['Product Category']))].sort();
  const aov = cats.map(c=>{
    const sub = rows.filter(r=>r['Product Category']===c);
    const s = sumField(sub,'Sales'), o = sumField(sub,'Orders');
    return o>0 ? s/o : 0;
  });
  const aovOrder = cats.map((c,i)=>({c,v:aov[i]})).sort((a,b)=>b.v-a.v);
  renderChart('chart-aov-cat','bar',{
    labels: aovOrder.map(o=>o.c),
    datasets:[{ data: aovOrder.map(o=>o.v), backgroundColor:PINKD, borderRadius:5 }]
  }, gridOpts(true));

  // Payment method
  const payments = [...new Set(rows.map(r=>r['Payment Method']))].sort();
  const paymentOrders = payments.map(p=> sumField(rows.filter(r=>r['Payment Method']===p),'Orders'));
  renderChart('chart-payment','doughnut',{
    labels: payments,
    datasets:[{ data: paymentOrders, backgroundColor:[INK,BLUE,PINK,SAGE,RED], borderWidth:3, borderColor:'#fff' }]
  }, { responsive:true, plugins:{ legend:{position:'bottom', labels:{font:{family:'Inter',size:10}, boxWidth:10}},
      tooltip:{backgroundColor:INK, callbacks:{label:c=>`${c.label}: ${c.raw.toLocaleString('en-IN')} orders`}} } });
}

// ---------- III. ANOMALY ----------
function renderAnomalySection(rows){
  const statuses = ['Delivered','Shipped','Pending','Cancelled'];
  const totalOrders = sumField(rows,'Orders');
  const statusOrders = statuses.map(s=> sumField(rows.filter(r=>r['Delivery Status']===s),'Orders'));
  const statusPct = statusOrders.map(o=> totalOrders>0 ? (o/totalOrders*100) : 0);

  const swatchRow = document.getElementById('swatch-row');
  const classes = {Delivered:'swatch-delivered',Shipped:'swatch-shipped',Pending:'swatch-pending',Cancelled:'swatch-cancelled'};
  swatchRow.innerHTML = statuses.map((s,i)=>`
    <div class="swatch" style="--w:${statusPct[i].toFixed(2)}%">
      <div class="swatch-fill ${classes[s]}"></div>
      <span class="swatch-tag">${s}<br><b>${statusPct[i].toFixed(2)}%</b></span>
    </div>`).join('');

  const spread = Math.max(...statusPct) - Math.min(...statusPct);
  const caption = document.getElementById('swatch-caption');
  if(totalOrders === 0){
    caption.textContent = 'No orders match the current filters — clear a filter to see the fulfilment split.';
  } else if(spread < 2){
    caption.textContent = `Four outcomes. Spread of just ${spread.toFixed(2)} points across ${totalOrders.toLocaleString('en-IN')} orders in this view. This close to an even split rarely happens by chance in real fulfilment data — worth a pipeline-level check before treating it as a real crisis.`;
  } else {
    caption.textContent = `Across ${totalOrders.toLocaleString('en-IN')} orders in this view, the spread between the highest and lowest status share is ${spread.toFixed(2)} points — filtering has revealed a less even split than the full dataset shows.`;
  }

  // Heatmap: region x category, cancelled orders only
  const cancelledRows = rows.filter(r=>r['Delivery Status']==='Cancelled');
  const regions = [...new Set(rows.map(r=>r['Region']))].sort();
  const cats = [...new Set(rows.map(r=>r['Product Category']))].sort();
  buildHeatTable(cancelledRows, regions, cats);

  // Findings list
  const cancelledSales = sumField(cancelledRows,'Sales');
  const cancelRate = totalOrders>0 ? (sumField(cancelledRows,'Orders')/totalOrders*100) : 0;
  const list = document.getElementById('findings-list');
  list.innerHTML = `
    <li><span>↓</span> ${cancelRate.toFixed(2)}% of orders in this view are cancelled — compare against the 5–10% typical retail benchmark.</li>
    <li><span>★</span> Recommend auditing the order-status pipeline itself before reallocating any fulfilment budget.</li>
    <li><span>↑</span> Cancelled orders in this view represent roughly ${fmt(cancelledSales)} in lost sales value.</li>
  `;
}

function buildHeatTable(cancelledRows, regions, cats){
  const table = document.getElementById('heat-table');
  if(regions.length===0 || cats.length===0){
    table.innerHTML = '<tbody><tr><td style="padding:14px;color:#999;">No data for current filters</td></tr></tbody>';
    return;
  }
  const grid = regions.map(rg=> cats.map(c=> sumField(cancelledRows.filter(r=>r['Region']===rg && r['Product Category']===c),'Orders')));
  const flat = grid.flat();
  const max = Math.max(...flat,1), min = Math.min(...flat,0);

  let html = '<thead><tr><th>Region</th>' + cats.map(c=>`<th>${c}</th>`).join('') + '</tr></thead><tbody>';
  regions.forEach((rg,i)=>{
    html += `<tr><td class="rl">${rg}</td>`;
    cats.forEach((c,j)=>{
      const v = grid[i][j];
      const p = max>min ? (v-min)/(max-min) : 0;
      const bg = `rgba(201,55,44,${0.15+p*0.55})`;
      html += `<td style="background:${bg}">${v.toLocaleString('en-IN')}</td>`;
    });
    html += '</tr>';
  });
  html += '</tbody>';
  table.innerHTML = html;
}

// ---------- IV. TEAM ----------
function renderTeamSection(rows){
  const reps = [...new Set(rows.map(r=>r['Sales Representative']))];
  const repSales = reps.map(rp=> sumField(rows.filter(r=>r['Sales Representative']===rp),'Sales'));
  const repProfit = reps.map(rp=> sumField(rows.filter(r=>r['Sales Representative']===rp),'Profit'));
  const repMargin = reps.map((rp,i)=> repSales[i]>0 ? repProfit[i]/repSales[i]*100 : 0);

  const bySales = reps.map((rp,i)=>({rp,s:repSales[i],m:repMargin[i]})).sort((a,b)=>b.s-a.s);
  renderChart('chart-reps','bar',{
    labels: bySales.map(o=>o.rp),
    datasets:[{ data: bySales.map(o=>o.s), backgroundColor:PINK, borderRadius:5 }]
  }, gridOpts(true));

  const byMargin = [...bySales].sort((a,b)=>b.m-a.m);
  const marginVals = byMargin.map(o=>o.m);
  const mMin = Math.min(...marginVals,0), mMax = Math.max(...marginVals,1);
  renderChart('chart-rep-margin','bar',{
    labels: byMargin.map(o=>o.rp),
    datasets:[{ data: marginVals, backgroundColor:SAGE, borderRadius:5 }]
  }, {...gridOpts(false), scales:{...gridOpts(false).scales, y:{...gridOpts(false).scales.y, min:Math.max(0,mMin-1), max:mMax+1}}});

  // Region x Category stacked
  const regions = [...new Set(rows.map(r=>r['Region']))].sort();
  const cats = [...new Set(rows.map(r=>r['Product Category']))].sort();
  const colors=[PINK,INK,SAGE,AMBER];
  const datasets = cats.map((c,i)=>({
    label:c,
    data: regions.map(rg=> sumField(rows.filter(r=>r['Region']===rg && r['Product Category']===c),'Sales')),
    backgroundColor: colors[i%4], stack:'s'
  }));
  renderChart('chart-region-cat','bar',{ labels: regions, datasets },
    { responsive:true, plugins:{ legend:{display:true, position:'bottom', labels:{font:{family:'Inter',size:10}, boxWidth:10}},
        tooltip:{backgroundColor:INK, callbacks:{label:c=>`${c.dataset.label}: ${fmt(c.raw)}`}} },
      scales:{ x:{stacked:true, ticks:{font:{family:'Inter',size:10}}, grid:{display:false}},
               y:{stacked:true, ticks:{font:{family:'Inter',size:10}, callback:v=>fmt(v)}, grid:{color:'#EFE6D8'}} } });

  // At-a-glance stat card
  const totalOrders = sumField(rows,'Orders');
  const totalSales = sumField(rows,'Sales');
  const totalCustomers = sumField(rows,'Customers'); // sum of per-cell customer counts (approx, cells may overlap on shared customers)
  document.getElementById('stat-customers').textContent = totalCustomers.toLocaleString('en-IN');
  document.getElementById('stat-aov').textContent = totalOrders>0 ? fmt(totalSales/totalOrders) : '₹0';
  document.getElementById('stat-reps').textContent = reps.length;
  document.getElementById('stat-rows').textContent = rows.length.toLocaleString('en-IN');
}

// ---------- CHART HELPERS ----------
function renderChart(canvasId, type, data, options){
  const el = document.getElementById(canvasId);
  if(!el) return;
  if(CHARTS[canvasId]) CHARTS[canvasId].destroy();
  CHARTS[canvasId] = new Chart(el, { type, data, options });
}

function gridOpts(moneyAxis=true){
  return {
    responsive:true,
    plugins:{
      legend:{display:false},
      tooltip:{
        backgroundColor:INK,
        titleFont:{family:'Inter',size:12},
        bodyFont:{family:'Inter',size:12},
        padding:10, cornerRadius:6,
        callbacks:{ label: c => (c.dataset.label||c.label)+': '+(moneyAxis? fmt(c.raw) : c.raw.toFixed(2)+'%') }
      }
    },
    scales:{
      y:{ ticks:{ font:{family:'Inter',size:10}, callback:v=> moneyAxis? fmt(v): v+'%' }, grid:{color:'#EFE6D8'} },
      x:{ ticks:{ font:{family:'Inter',size:10} }, grid:{display:false} }
    }
  };
}

function donutOpts(values){
  const total = values.reduce((a,b)=>a+b,0);
  return { responsive:true, plugins:{ legend:{position:'bottom', labels:{font:{family:'Inter',size:11}, boxWidth:11}},
    tooltip:{backgroundColor:INK, callbacks:{label:c=>`${c.label}: ${fmt(c.raw)} (${total>0?(c.raw/total*100).toFixed(1):0}%)`}} } };
}

// ---------- SCROLL SPY ----------
function setupScrollSpy(){
  const sections = document.querySelectorAll('.sheet');
  const railItems = document.querySelectorAll('.rail-section');
  const map = {};
  railItems.forEach(r => map[r.dataset.target] = r);

  const obs = new IntersectionObserver((entries)=>{
    entries.forEach(e=>{
      if(e.isIntersecting){
        railItems.forEach(r=>r.classList.remove('active'));
        if(map[e.target.id]) map[e.target.id].classList.add('active');
      }
    });
  }, { threshold:0.4 });

  sections.forEach(s=> obs.observe(s));

  railItems.forEach(r=>{
    r.addEventListener('click', ()=>{
      const target = document.getElementById(r.dataset.target);
      if(target) target.scrollIntoView({behavior:'smooth'});
    });
  });
}

// ---------- FILTER WIRING ----------
function setupFilters(){
  const selects = document.querySelectorAll('.rail-filters select');
  selects.forEach(s=>{
    s.addEventListener('change', ()=>{
      s.classList.toggle('active-filter', s.value !== '');
      renderAll();
    });
  });
  document.getElementById('reset-btn').addEventListener('click', ()=>{
    selects.forEach(s=>{ s.value=''; s.classList.remove('active-filter'); });
    renderAll();
  });
}

window.addEventListener('load', ()=>{
  setupScrollSpy();
  setupFilters();
  loadData();
});