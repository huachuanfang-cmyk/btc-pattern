# My BTC Box

Static crypto historical pattern and backtest tool. Current assets: BTC, ETH, SOL, DOGE, and BNB.

Production site: https://www.mybtcbox.com

## Local data update

```powershell
npm run update:crypto
```

This updates:

- `data/crypto.daily.json`
- `data/crypto.daily.js`
- individual `data/*.daily.json` and `data/*.daily.js` files

Historical OHLCV source: Yahoo Finance `BTC-USD`, `ETH-USD`, `SOL-USD`, `DOGE-USD`, and `BNB-USD`.
