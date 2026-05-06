# tokmato 🍅

番茄 token 应用：把每日的专注产出与健康行为记为可审计的代币，再以代币兑换娱乐时间、零食或愿望清单上的物品。

https://tokmato.nihildigit.dev

## 为何不用现有番茄钟

现有番茄钟应用普遍以 "25 分钟专注 + 5 分钟休息" 为核心，提供计时与累计统计。这类工具解决的是 "能否完成一次专注"，并不回答另一个更高频的问题：今天累积的产出是否足以支撑今晚的休闲？后一个问题在自我管理偏弱的人群中常以模糊的内疚或反向的过度补偿出现，而这两种状态都会损耗次日。tokmato 把这个判断从隐式情绪转为显式记账。

## 系统边界

代币只对接两类活动：会过度消耗注意力的高刺激消遣（外卖、熬夜、刷手机、打游戏、看剧），以及与之对偶的产出（专注番茄、健康自控）。这一面之外的低刺激日常——读书、运动、线下社交、正常聚餐——刻意留在系统外，不计 token、不进结算。

划线在此的理由有二。其一，正向行为一旦被换算成奖励单位，会从内驱滑向外驱，使本来就稳定的习惯反而变成需要"完成"的任务，与系统试图缓解的焦虑同源。其二，记账本身的认知成本只在收益足够大时才划得来；让低频会让人自我说服的高刺激消遣承担这个成本，而非让每一杯水、每一次散步都进入会计循环。

实际操作上，看到不在上述清单内的行为想要"也记一下"是常见的扩张冲动；按设计，应当克制不加。系统的窄聚焦本身就是它的功能。

## 代币经济学

系统由两种代币与一个共享的时间池构成：

- **FToken**：专注产出（输入型番茄每个 +1，输出型 +0.5）
- **HToken**：健康行为（早睡、运动、按时吃饭）

两者均不可直接消费，需先经 recharge 操作兑换为时间池中的可支配分钟数，再支付娱乐时段、零食或愿望清单上的物品。

设双代币而非单一综合分数，是为规避隐性的代价转移：单一指标会把 "通宵学 8 个番茄" 判为高产，但其实是用健康额度换取了专注分数；分轴记账后，两侧的得失各归其位，便于使用者事后复盘。

时间池作为中间层存在的原因，是 "今日产出 → 今晚奖励" 的直连兑换在决策时刻容易触发合理化偏差。多一步显式的换算动作，把代价与收益的对应关系外显，降低自我说服的可乘之机。

愿望清单是长期通道，把每日盈余沉淀为对未来的具体承诺，例如某台显示器或某款游戏，而非即时消耗。

## 同步模型

云端持久化采用 Upstash Redis 单 key 存放完整状态快照，写入受 zod 校验、1 MB 字节上限与每分钟 30 次的速率限制三层保护。设备端在登录后启用自动同步：Token 余额或集合长度变化时触发 2 秒防抖的写入；应用打开时拉取一次云端快照，按 id 去重合并到本地。账本、看板、愿望清单、tag / bonus 配置都按 id dedup；余额从合并后的账本重新算出来；正在跑的番茄 / 娱乐 session 以本地为准——避免刚启动还没 autosave 上去就被云端旧 snapshot 抹掉。

未采用事件溯源（event sourcing）的取舍有两层。其一，应用面向单用户单账号，"两端同时修改同一字段" 的真实概率极低，事件去重与排序的工程复杂度不与之匹配。其二，事件词汇会随每个新增字段线性扩张，对应客户端 reducer 与服务端 apply 逻辑也成倍增长；快照模型把这些归并为单次校验 + 合并的开销，在单用户场景下显著降低维护成本。

合并策略并非真正的 OT / CRDT。同一字段在多端几秒之内交叉改写仍可能丢失早一侧的修改，但在单用户日常路径上几乎不触发；以 id 为 key 的集合 dedup 已经足够覆盖跨端 token 收支记录、看板卡片、愿望清单这些主要场景。

## 推送通知

番茄到点提醒在两条独立通道上送达。

浏览器和 PWA 走 Web Push：番茄启动时客户端经 server action 向 Upstash QStash 推一条延时 25 分钟的回调消息；到时 QStash 回调 server，由 web-push 向用户已注册的订阅投递 VAPID 签发的载荷。整条链路在服务端自我递推下一条延时消息（缓冲结束 1 分钟），使用者关闭浏览器或锁屏后仍可如期收到提醒。

Android 上从 v2.4 起多了一条原生 FCM 通道。Web Push 协议层缺少 high-priority 的开关，到点的通知会被 Android 的 Doze 模式压到下次亮屏才放出来，延迟可达数分钟到十几分钟；原生 FCM 走 firebase-admin 发 priority:high，能透 Doze 即时弹。v3.x 之后这条通道由 `mobile/` 下的 Expo / RN 应用承载（早期为 Capacitor WebView 套壳，已退场），通过 `expo-notifications` 注册 FCM token。两条通道并行投递、互不替代——浏览器 / PWA 用户照旧拿 Web Push，装了 APK 的设备额外多一份原生投递。

未使用浏览器端 setInterval 或 setTimeout 的原因是这些计时器在标签页隐藏或设备休眠时被严格限速，无法保证在番茄结束的瞬间触发；即便授予了 Notification 权限，浏览器闲置态下的可达性也接近不可用。把调度迁至云端后，提醒可达性与浏览器开启状态解耦。

每条消息的 sessionId 由番茄启动瞬间的时间戳派生。使用者手动跳过缓冲时 sessionId 会被重写，旧链路上残留的回调到达时与当前 sessionId 失配，按设计静默退出，无须显式取消。

## Android APK

每个 v* tag 触发 GitHub Actions 通过 EAS Build 出一个 release-signed APK，附在对应的 GitHub Release 下面。最新版：[releases/latest](https://github.com/NihilDigit/tokmato/releases/latest)。

不上 Play Store，sideload 自用。`mobile/` 是独立的 Expo / RN 工程，与 web 共享 `shared/` 下的 Zustand store / Zod schema / 类型定义；服务端通过 `app/api/rpc/*` 给 RN 客户端提供与 web server actions 同形态的 REST 接口。原生通知走 FCM 而非 Web Push。

## 跨端只读 awareness

当一台设备正在运行番茄时，其他已登录设备打开应用会自动进入只读镜像状态，禁用 Start 按钮，从根上避免双端同时启动番茄。

实现是一份独立的 30 分钟 TTL 的 KV 标记，由番茄启动、手动跳过缓冲、番茄结束三处客户端写入，并由 `/api/push/fire` 在每次链路推进时同步刷新——即便原始设备已关闭标签页，标记仍会随推送链保持有效。其他设备每 30 秒轮询此标记，读到非自身会话即渲染只读视图。

未采用客户端心跳是因为推送链本身就是天然的心跳源；30 分钟 TTL 在最坏情况下也只让一份失效标记滞留半小时，对单用户场景属于可接受的延迟。

## 已知取舍

- 应用面向单用户单账号设计，不支持多用户共享、团队协作或代理代办场景。
- 同步策略为按 id 去重的合并，并非真正的 OT / CRDT；同一字段在多端几秒之内交叉改写仍可能丢失早一侧的修改。单用户场景下该竞态的发生概率极低。
- Android APK 用于绕开 Doze；OEM（小米 / 华为 / OPPO / vivo）自带的更激进省电策略可能盖过 priority:high，priority:high 不是绝对保障。
- 主要目标群体是 ADHD 倾向的考研使用者，部分交互（长按结束、径向手势看板、4am 日界）针对其注意与决策模式优化，对其他使用者可能显得冗余。
- 数学 tag 阶梯奖（5 / 7 / 9 / 11）的阈值依据作者考研数学复习节奏手工标定，未必适用其他使用场景。

## 功能

- 番茄钟（25 + 1 缓冲），基于 wall-clock 计时，标签页隐藏或设备休眠不漂移
- 双通道推送：Web Push（浏览器 / PWA）+ 原生 FCM（Expo / RN APK），后者 priority:high 绕 Doze
- 多设备自动同步（GitHub 登录），id 去重合并而非全量覆盖
- 跨端只读 awareness：一端运行时其他端自动只读镜像
- 看板：四象限 + 收件箱，移动端径向手势移动
- 数学 tag 每天 5 / 7 / 9 / 11 个番茄，每挡额外 +1 FToken
- PWA，iOS 加到主屏幕后可接收推送
- 暗色模式（墨调深棕，非 OLED 黑）

## 技术栈

Next.js 16 / React 19 / Tailwind 4 / shadcn/ui / Zustand / Auth.js v5 / Upstash Redis & QStash / web-push / firebase-admin / Expo SDK 52 + RN 0.76 / Bun。Vercel 部署 web，GitHub Actions 通过 EAS Build 出 APK。

设计规范见 `.impeccable.md`，工程文档见 `CLAUDE.md`。RN 应用的入口与构建说明见 `mobile/README.md`。

## 开发

```bash
bun install
bunx vercel env pull .env.local --yes
bun run dev      # localhost:3000
bun run test     # 真 Upstash + QStash
bun run build
```

## 发布

```bash
git tag -a v2.x --cleanup=verbatim -m "$(cat <<'EOF'
v2.x — subject

## 主要变化
...
EOF
)"
git push origin main v2.x
```

每个 v* tag 触发两条 workflow：一条把 web 部署到 Vercel，一条用 GitHub Actions runner 通过 EAS Build 出 Android APK 并发布 GitHub Release（release notes 取自 tag 注解，APK 自动 attach）。`NEXT_PUBLIC_APP_VERSION` 在 build 阶段注入，UI 版本号随 tag 自动更新。

## 许可

AGPL-3.0。完整文本见 [LICENSE](./LICENSE)。任何在网络上对外提供本项目（含修改版）的服务，需向用户提供对应的源代码。

欢迎 PR；本项目由个人维护，涉及行为改动的 PR 请先在 Issue 中提 RFC 对齐方向。
