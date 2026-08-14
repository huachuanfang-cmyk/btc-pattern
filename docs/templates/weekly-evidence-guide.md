# 30天真实证据每周记录说明

本模板用于连续30天保存数据更新、线上巡检、搜索表现和匿名回访的聚合证据。每周固定一次，在同一 UTC 截止时间导出并追加一行。模板不得预填示例数字，自动测试通过也不能替代真实观察。

## 统一记录规则

- `week_start_utc`、`week_end_utc` 使用 `YYYY-MM-DD`，每个自然周不得重叠或留空。
- 数量字段填写非负整数；百分比保留最多两位小数，不带 `%` 符号。
- 暂时无法获得的字段留空，并在 `limitations` 写明原因；不得用 `0` 伪装“没有发生”。
- `evidence_refs` 填写可复核的 GitHub Actions 运行 ID、Issue URL、Search Console 导出文件名或匿名聚合报告日期。多个引用用分号分隔。
- 只保留聚合数量，不记录姓名、邮箱、钱包、IP、Cookie、客户端 ID 或任何可识别单个用户的数据。

## GitHub日更与线上巡检

- `github_daily_update_scheduled`：本周按工作流计划应运行的日更次数，包括因平台故障未启动但本应运行的次数。
- `github_daily_update_successful`：完成抓取、测试并成功发布数据的次数。重跑成功不能删除之前的失败。
- `github_daily_update_success_rate_pct`：成功次数 ÷ 应运行次数 × 100。
- `online_checks_scheduled`：本周按计划应运行的线上健康巡检次数。
- `online_checks_successful`：完整通过线上健康门槛的巡检次数。
- `online_check_success_rate_pct`：成功巡检 ÷ 应运行巡检 × 100。
- `recovery_incidents`：本周需要人工或机器人恢复的独立故障数，同一根因的重复告警只计一次。
- `recovery_completed`：本周已经恢复并用线上检查确认的故障数。
- `recovery_minutes_total`：从首次有效告警到线上恢复确认的总分钟数；跨周故障在恢复周记录并在限制中说明。

## 搜索收录与自然访问

- `indexed_tool_urls`：在 Search Console URL 检查或网页索引报告中确认已收录的核心工具 URL 数量。
- `eligible_tool_urls`：当前应被索引的核心工具 URL 总数，现阶段为6。被 robots 或 canonical 意外阻断的页面仍应进入分母。
- `organic_impressions`、`organic_clicks`：Search Console 中同一日期范围、Web 搜索类型的自然曝光和点击聚合。
- `organic_ctr_pct`：自然点击 ÷ 自然曝光 × 100；曝光为0时留空并说明，不写无意义的0%。
- 公开 `site:` 查询只能写入 `limitations` 作为辅助观察，不能代替 Search Console 证据。

## 匿名回访分母

- `d0_users`：本周首次发送 `d0` 里程碑且主动同意匿名分析的聚合用户数。
- `d1_eligible_users`：对应 D0 后已经经历完整 1 个 UTC 日、具备回访资格的用户数。
- `d1_returning_users`：合格分母中实际发送 `d1` 里程碑的用户数。
- `d7_eligible_users`：对应 D0 后已经经历完整 7 个 UTC 日的用户数。未满7天的新用户不得进入 D7 分母。
- `d7_returning_users`：D7 合格分母中实际发送 `d7` 里程碑的用户数。
- `d30_eligible_users`：对应 D0 后已经经历完整 30 个 UTC 日的用户数。
- `d30_returning_users`：D30 合格分母中实际发送 `d30` 里程碑的用户数。

D1、D7、D30 必须按同期 D0 cohort 计算，不能用当周全部访问者作为分母。用户撤销分析后不再产生新事件；不得通过推测补齐缺失事件。

## 30天结论

至少保存一个完整30天窗口后，才能汇总 D7 回访率、工具页收录与自然搜索趋势。D7 回访率 = `d7_returning_users` 合计 ÷ `d7_eligible_users` 合计。若跨周 cohort 尚未成熟，应继续等待，不提高评分。

模板、测试或采集基础设施本身均不提高评分。评分只依据真实导出、可复核引用、完整观察窗口和 `docs/quality-standard-95.md` 的门槛。
