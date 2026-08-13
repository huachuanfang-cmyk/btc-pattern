# 数据更新与恢复运行手册

更新时间：2026-08-11

## 正常更新链路

1. GitHub Actions 每天 02:30 UTC 运行 `update-btc-data.js`；更新脚本、日线 JSON、健康清单或工作流修复推送时也立即运行一次恢复验证。
2. 脚本从 Yahoo Finance 获取五个交易对的 UTC 日线，只保留已完成日线。
3. 更新过程检查日期重复、日期连续、OHLC 范围、成交量和数值有效性。
4. `npm test` 检查数据、关键计算、页面回归和质量计分卡。
5. 全部通过后才提交日线文件与数据健康文件。
6. GitHub Pages 或当前托管平台从 `main` 自动部署。
7. `_headers` 要求浏览器和 CDN 每次重新验证 HTML 与 `data/*`，避免每日数据被旧缓存遮挡。

## 告警

工作流任一步失败时，会创建或更新题为 `Automated crypto data update failed` 的 GitHub Issue，并附带失败运行链接。下一次完整成功后，工作流会留言并关闭该 Issue。

独立的线上巡检每 6 小时读取 `https://www.mybtcbox.com/data/health.json`，检查 HTTP 内容类型、五种资产是否齐全、数据延迟、样本量和 SHA-256 字段。健康清单、巡检脚本或巡检工作流推送时也立即检查，避免恢复后等待下一个 6 小时窗口。失败时创建或更新 `Published crypto data health check failed` Issue，恢复后自动留言并关闭。它能发现“仓库更新成功但线上部署或缓存仍异常”的情况。

维护者仍需在 GitHub 账户中开启仓库 Issue 通知。Issue 是公开可追踪的异常记录，不得在其中粘贴令牌、Cookie 或其他凭据。

## 人工检查

1. 打开失败的 Actions 运行，确定失败发生在获取、校验、测试、提交还是告警步骤。
2. 查看 `data/health.json` 的 `generated_at`、总状态和各资产 `lag_days`。
3. 打开 `https://www.mybtcbox.com/status.html`，确认公开状态与清单一致。
4. 对照对应 `data/*.daily.json` 的 `data_through` 和最后两条日线。
5. 检查 Yahoo Finance 对应交易对是否暂时无数据或修改了响应结构。
6. 不得为了恢复更新而跳过校验或删除失败测试。

## 本地恢复

在干净分支执行：

```powershell
npm run update:crypto
npm test
npm run health:check
git diff --check
```

线上恢复后执行：

```powershell
npm run health:online
```

确认五个资产的最新完整 UTC 日期合理，`data/health.json` 状态为 `healthy`，然后只提交本次生成的数据文件和必要修复。

## 回滚

如果错误数据已经上线：

1. 确认最后一个正确提交和错误提交的 SHA。
2. 使用 `git revert <错误提交SHA>` 创建可追踪的反向提交，不使用强制推送。
3. 推送后确认线上日线文件、健康文件和首页数据日期都恢复一致。
4. 保留失败 Issue，记录原因、影响范围、恢复时间和防止复发的测试。

## 最近成功快照

Git 历史中的最近一次通过测试的数据提交就是可恢复快照。每个健康清单还包含各资产日线数组的 SHA-256，可用于确认 JSON 内容没有静默变化。

## 30 分钟恢复目标

- 5 分钟内确认异常类型。
- 10 分钟内决定等待上游、修复脚本或回滚。
- 20 分钟内完成测试并推送恢复提交。
- 30 分钟内验证线上文件和首页日期，更新失败 Issue。
