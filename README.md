# My BTC Box

Static crypto historical pattern and backtest tool. Current assets: BTC, ETH, SOL, DOGE, and BNB.

Production site: https://www.mybtcbox.com

## Product quality target

The project tracks ten evidence-based product dimensions with a target of 9.5/10 or higher.

- Standard: `docs/quality-standard-95.md`
- Current scorecard: `quality-scorecard.json`
- Validate the scorecard: `npm run quality:score`

## Local data update

```powershell
npm run update:crypto
```

This updates:

- `data/crypto.daily.json`
- `data/crypto.daily.js`
- individual `data/*.daily.json` and `data/*.daily.js` files

Historical OHLCV source: Yahoo Finance `BTC-USD`, `ETH-USD`, `SOL-USD`, `DOGE-USD`, and `BNB-USD`.
