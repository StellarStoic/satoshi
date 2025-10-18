## 📊 Bitcoin Price Data Pipeline

### **Step 1: Source BTC/USD Historical Data**
- **Source**: `https://data.bitcoinity.org/markets/price/all/USD`
- **What you get**: CSV with daily BTC prices in USD since 2010
- **Format**: Multiple exchange columns, you average them into one USD price per day

### **Step 2: By running** ```getExchangeRatesFromFrankfurt.py``` **script Fetch Fiat Exchange Rates**  
- **Source**: `https://frankfurter.dev/latest?from=USD`
- **What you get**: Current USD→Fiat conversion rates for 30+ currencies
- **Example**: `{EUR: 0.93, JPY: 160.1, GBP: 0.79, ...}`

### **Step 3: Historical Currency Conversion**
For **each target currency** (EUR, JPY, GBP, etc.):

```
BTC/Currency Price = BTC/USD Price × USD/Currency Rate
```

**Example for EUR:**
- BTC/USD: $50,000
- USD/EUR: 0.93
- **BTC/EUR**: $50,000 × 0.93 = €46,500

### **Step 4: Store Converted BTC Prices**
- **Output**: `converted_history/satoshi_hist_data_EUR.csv`
- **Content**: Daily `Time,satoshi.si` pairs since 2010
- **But the `satoshi.si` column actually contains**: **BTC price in that fiat currency**

**Wait, this is confusing!** The column is called `satoshi.si` but contains BTC prices, not satoshi values. Just an unintentional Ad

### **Step 5: Your Chart Calculates Satoshis On-the-Fly**
In your JavaScript, you calculate:
```javascript
sats = 100000000 / btcPrice
```

So the CSV files store **BTC/Fiat prices**, and your chart converts them to **satoshi/fiat** in real-time.

## 🎯 Final Result
Your CSV files are stored separately for each currency in ```converted_history``` folder, containing **historical BTC prices in each fiat currency**, and your chart dynamically calculates:

**Satoshi per 1 Fiat Unit = 100,000,000 ÷ BTC/Fiat Price**

**Example for EUR:**
- CSV shows: BTC/EUR = €46,500
- Chart calculates: 100,000,000 ÷ 46,500 = **2,150 sats per 1 EUR**

So the exported data shows the **BTC price history**