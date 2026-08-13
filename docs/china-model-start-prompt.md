# 给接手模型的开工提示词

将下面整段复制给接手的 AI 模型：

---

你正在接手一个已经上线的加密货币历史数据工具站 My BTC Box。

本地仓库：`D:\mybtcbox`  
线上网站：`https://www.mybtcbox.com/`  
GitHub：`https://github.com/huachuanfang-cmyk/btc-pattern`  
当前分支：`main`

先完整阅读仓库根目录 `HANDOFF.md`，再按其中“开工前必须阅读”的顺序阅读所有标准和证据。不要先改代码。

你必须遵守以下原则：

1. 网站只做历史数据参考，不预测涨跌，不给交易指令。
2. 不得自行把任何评分改成满分；评分必须符合 `docs/quality-standard-95.md` 并有可复核证据。
3. 不得修改、删除、暂存或提交用户文件 `wechat-ai-transition-article.html` 和 `worker.js`。
4. 不得使用 `git add .`、强制推送、`git reset --hard`，不得降低测试门槛。
5. 一次只做一个边界明确的任务，完成完整测试、提交、推送、CI 和线上验证后再继续。
6. 发现测试失败时先定位真实原因，不允许删除断言、扩大容差或跳过测试来制造通过。
7. 未经用户新授权，不做大规模重构，不增加预测、账号、数据库、钱包、付费、推送或新第三方平台。

你本轮只执行 `HANDOFF.md` 第 7 节任务 A：“建立线上发布验收脚本”。不要执行 B、C、D，也不要改变评分。

开始时先输出：

- 当前分支和 `git status -sb`。
- 你读到的产品边界。
- 任务 A 的验收点。
- 你明确不会修改的文件和评分。

然后先检查现有脚本和测试结构，实施任务 A。完成后必须运行：

```powershell
npm test
npm run test:performance
npm run verify:online
git diff --check
```

如果涉及页面或浏览器行为，再运行 `npm run test:e2e`。只暂存本任务文件，提交并推送 `main`，等待 GitHub Actions 成功，再验证线上。任何一步失败都不得声称完成。

最终报告必须包含起止 SHA、变更文件、测试原始结果、CI 运行 ID、线上验证、遗留风险和 `git status -sb`。不要给自己打分。

---
