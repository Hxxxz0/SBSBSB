# SBSBSB

一个用于生成腾讯文档班级在校情况更新的 Codex Skill。

当前 skill：`qq-docs-class-status`

## 功能

从腾讯文档在线表格读取每日打卡数据，按指定班级统计当天情况，并生成固定格式的中文汇总。

默认逻辑：

- 先获取当前日期，默认时区为 `Asia/Shanghai`
- 找到表格里当天对应的日期列
- 统计指定班级的 `在校住宿`、`在家`、`校外住宿`
- 空白未填的人写作 `xx联系不上`
- 与前一天已填写数据对比，只生成 `xx离校` 或 `xx返校`
- 如果没有离校/返校变化，写 `相较于昨天无变化`

示例输出：

```text
崇新在校情况更新：7人在校，18人在家，0人校外居住，胡君安、张子诺联系不上，相较于昨天无变化。
```

## 目录

```text
qq-docs-class-status/
├── SKILL.md
├── agents/
│   └── openai.yaml
└── scripts/
    └── qq_docs_class_status.js
```

## 使用

在仓库根目录运行：

```bash
NODE_PATH="/Users/hzzzz./.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules" \
node qq-docs-class-status/scripts/qq_docs_class_status.js \
  --url "https://docs.qq.com/sheet/DQ29wZFNORWJ6YkZH?tab=000001&_t=1783786409538&nlc=1" \
  --class "崇新"
```

常用参数：

```bash
--class "崇新"          # 班级关键词，可匹配 崇新23
--date "7月11日"       # 手动指定日期
--timezone Asia/Shanghai
--latest-filled        # 不按今天，改用最新已填写日期列
--json                 # 输出详细 JSON
--wait-ms 8000         # 腾讯文档加载等待时间
```

## 安装到 Codex

把 skill 目录复制到本机 Codex skills 目录：

```bash
cp -R qq-docs-class-status ~/.codex/skills/qq-docs-class-status
```

然后在 Codex 中可以要求：

```text
用 qq-docs-class-status 生成今天崇新的在校情况
```

## 验证

验证 skill 元数据：

```bash
python3 /Users/hzzzz./.codex/skills/.system/skill-creator/scripts/quick_validate.py qq-docs-class-status
```

验证真实腾讯文档输出：

```bash
NODE_PATH="/Users/hzzzz./.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules" \
node qq-docs-class-status/scripts/qq_docs_class_status.js \
  --url "https://docs.qq.com/sheet/DQ29wZFNORWJ6YkZH?tab=000001&_t=1783786409538&nlc=1" \
  --class "崇新" \
  --wait-ms 8000
```

## 输出格式

有联系不上但无变化：

```text
崇新在校情况更新：7人在校，18人在家，0人校外居住，胡君安、张子诺联系不上，相较于昨天无变化。
```

有离校/返校变化：

```text
崇新在校情况更新：7人在校，20人在家，0人校外居住，相较于昨天，王嵩泽离校。
```
