# 线上发布验收记录：2026-08-14

## 目标

建立可重复执行的只读线上发布检查，避免把代码推送成功误认为网站已经正确上线。本任务不修改任何质量评分。

## 检查范围

- 11 个 HTML 地址：首页、工具目录、方法页、状态页、隐私页和六个独立工具页。
- 7 个 JSON 地址：BTC、ETH、SOL、DOGE、BNB 日线，健康清单和公开复算样本。
- 六个工具页逐项检查 HTTP 200、HTML Content-Type、title、canonical、静态计算口径和 WebApplication JSON-LD URL。
- 首页检查“不预测”边界；方法页检查 Dataset；隐私页检查分析默认关闭。
- 健康清单复用 `scripts/check-data-health.js` 的同一判定逻辑，要求五种资产齐全且不超过两个 UTC 日延迟。

## 可复现命令

```powershell
node tests/online-release.test.js
npm run verify:online
```

## 测试方法

离线测试通过可注入的 `fetch` 返回固定响应，不依赖真实网络。失败样本覆盖：

- 工具页返回 HTTP 503，并报告具体 URL。
- 工具页 canonical 指向错误地址。
- 健康清单中的 BTC 数据超过两个 UTC 日。
- 日线地址错误返回 HTML Content-Type。
- 状态页发生网络断连，并保留具体 URL 和底层错误原因。

实现前先运行测试，按预期因缺少 `scripts/check-online-release.js` 失败；实现完成后离线测试通过。

## 首次线上结果

执行时间：2026-08-14（Asia/Shanghai）。

- HTML：11/11 通过。
- JSON：7/7 通过。
- 健康资产：5/5。
- 最大允许 UTC 数据延迟：2天。

首轮以18个请求同时访问时出现瞬时连接失败。检查器随后限制为最多一个 HTML 和一个 JSON 并行，并为幂等 GET 提供一次短暂重试；没有取消检查或降低健康门槛。调整后真实线上检查全部通过。

## 限制

- 本脚本验证发布内容、基础元数据和数据健康，不替代真实浏览器交互、Lighthouse、Search Console 或真实用户测试。
- 临时网络故障在一次重试后仍会使命令失败，并输出具体 URL；不得为了临时失败降低检查标准。
- 当前为人工执行的发布后验收命令，后续是否接入独立部署后工作流需单独授权和验证托管平台部署时序。
