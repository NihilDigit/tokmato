# tokmato → React Native 迁移研究

时间：2026-05-05
分支：`claude/react-native-migration-fO1Gl`
状态：研究，未动工

## 背景

用户希望"全面迁移至 React Native，带来原生消息通知、触屏优化、Web 和 App 双端更好性能"。研究后已与用户确认三条目标的现实落点：

- **原生消息通知** 在当前 Capacitor + FCM `priority:high` 路径下已经达成（见 `capacitor/EXPERIMENT.md`，透 Doze 实测可用）。RN 不会进一步打开这条目标，**只是把它从 WebView 壳搬进真原生**。
- **触屏优化** 是 RN 唯一无歧义的胜场。看板长按径向手势（`app/kanban/page.tsx`）目前用 `pointermove` + `elementFromPoint` 在 React 树里 setDrag，中端机会卡。底部 sheet（Radix Sheet 走 CSS transition）没有速度感、不可中断。RN + `react-native-gesture-handler` + `reanimated` 把手势放到 UI 线程，是真实的体感升级。
- **Web 双端更好性能** 与 RN 反向相关。RNW 把每个原语包成 `View/Text` 注入内联样式，丢掉 RSC 零 JS 首屏、丢掉 `unicode-range` 字体回退、`clamp()` 流式字号要 JS 重算。已和用户确认：**Web 保留 Next.js 不动**，迁移只针对原生壳。

由此决策为 **split 方案**：用 Expo 重写原生应用，废弃 `capacitor/` 套壳；Next.js 站点零回退；store / schema / server 通过 workspace 共享层和 REST RPC 桥接。**Android 优先，iOS 不在范围**。

## 备选方案及为何放弃

| 方案 | 结果 | 理由 |
|---|---|---|
| A. Expo Universal（Web+Native 单代码库） | 放弃 | Web 端会出现可观测的性能/排版回退（首屏 RSC 没了、CJK 楷体 fallback 要 regex 拆字、clamp 流式排版要 JS 重算）。换来唯一好处是 28 组件不写两遍，但代码量小到不构成动机。 |
| B. **仅原生 RN + Web 保留 Next.js** | **采纳** | Web 零回退；原生触屏拿到真实提升；store/schema/types 通过 workspace 共享。 |
| C. 纯 RN + RNW（手卷 Vite/Metro，不用 Expo） | 放弃 | A 的所有缺点 + 丢掉 Vercel 部署生态。 |
| D. 不迁移，针对触屏点定向优化 Capacitor | 部分采纳 | 借鉴它的"别动 web"理念，但用户要原生重写，看板/列表/sheet 物理收益是真实的。 |

## 目标架构

```
tokmato/
├── app/, components/, lib/         ← Next.js 完全不动
├── auth.ts                         ← 加 Bearer JWT 旁路（cookie 仍是 web 主路径）
├── shared/                         ← 新 workspace 包 @tokmato/shared
│   ├── store.ts (← lib/store.ts)
│   ├── snapshot-schema.ts
│   ├── types.ts, bonus.ts, ledger.ts, utils.ts, tag-colors.ts, version.ts
│   └── storage-port.ts             ← localStorage / AsyncStorage 适配点
├── app/api/rpc/*                   ← server actions 的 REST 镜像，给 RN 调
├── capacitor/                      ← Phase 6 删除
└── mobile/                         ← 新 Expo 工程
    ├── app/                        ← Expo Router 5 路由
    ├── components/
    └── styles/tokens.ts            ← globals.css → TS 令牌
```

**复用（不重写）**：`lib/store.ts`（Zustand 平台无关）、`lib/snapshot-schema.ts`（纯 Zod）、`lib/types.ts`、`lib/bonus.ts`、`lib/ledger.ts`、`lib/utils.ts`、`lib/fcm.ts`、`lib/web-push.ts`、`lib/qstash.ts`、`lib/kv.ts`、`app/api/push/fire/route.ts`（fan-out 双路已就绪，零修改）。

**重写**：28 web 组件 → ~30 RN 组件；`app/globals.css` 设计令牌 → `tokens.ts`；`lib/push-client.ts` 的 Capacitor 分支 → `expo-notifications`；`components/ui/responsive-sheet.tsx` → `@gorhom/bottom-sheet`；`auth.ts` 加 Bearer 旁路。

## 关键技术点

### 设计系统迁移
- 令牌（paper / ink / tomato / sage / teal / gold / plum 全色板 + dark）从 `app/globals.css:30-149` 直接复制到 `mobile/styles/tokens.ts`，键名相同。
- 流式字号 `clamp(48px,10vw,88px)` → `useWindowDimensions()` + `fluid(min, vw, max)` helper，按断点 memo 化避免渲染抖动。
- `unicode-range` CJK 字体回退在 RN 没有等价物。方案：`<EditorialText>` 组件渲染时正则切串 `/[　-鿿＀-￯]/`，CJK 段套 `font-kaiti`，拉丁段套 Instrument Serif。这是排版上**唯一不能像素级保真**的地方。
- `env(safe-area-inset-*)` → `react-native-safe-area-context` 的 `useSafeAreaInsets()`。
- `body[data-sheet-open]` 隐藏 tab bar → Zustand `uiStore.sheetOpen` 控制 `<MobileTabBar/>` 条件渲染。
- 样式库选 **react-native-unistyles v3**，不用 NativeWind v4：后者 `clamp()` / `var(--…)` 支持不全，编辑式流式字号过不去。Unistyles 编译期生成样式，原生支持主题/断点/动态单位。

### Auth：PKCE + Bearer JWT
RN 拿不到 `tokmato.nihildigit.dev` 的 HttpOnly cookie。方案：

- Expo AuthSession 直连 GitHub OAuth，PKCE，回调 `tokmato://auth/callback`。
- 拿到 GitHub access token 后 POST 到新端点 `app/api/rpc/exchange-github-token`，复用 `AUTH_SECRET` 用 `@auth/core/jwt` 签同样 shape 的 JWT（`token.sub = ${provider}:${providerAccountId}`，与 `auth.ts:33-34` 对齐，确保 KV namespace 一致）。
- JWT 存 `expo-secure-store`，所有 RPC 调用走 `Authorization: Bearer <jwt>`。
- `auth.ts` 加旁路：`/api/rpc/*` 接受 cookie session 或 Bearer，二选一即认证通过。`getUser()` 改为统一返回 `{ id }`。

### Push 传输
- Web / PWA：VAPID + Web Push 不动（`lib/web-push.ts`、`public/sw.js`）。
- RN Android：`expo-notifications` 注册 → POST 到 `app/api/rpc/save-fcm-token`（写 `kvKey.fcmTokens(userId)` Hash，与现有原生分支同库同 shape）。
- `app/api/push/fire/route.ts` 已对 web-push subs Hash + FCM tokens Hash 双路 fan-out，无需改动。

### 时钟与 AppState
`Date.now() - phaseStartedAt` 数学不变。`components/home/RunningView.tsx:117-120` 的 `visibilitychange` / `focus` / `pageshow` 在 RN 全部由 `AppState` `change` 事件 + `"active"` 状态覆盖。`setInterval(250)` 在 `AppState !== "active"` 时暂停省电，回到 active 立即 resync。`advancePomodoroPhase` 动作（`lib/store.ts:597-640`）零修改。

### 看板径向手势
- `react-native-gesture-handler` 的 `LongPressGesture(minDurationMs:360)` 替代 `pointerdown` + 计时器。
- `react-native-reanimated` shared values 跑锚点坐标 + chip 变换，UI 线程 60/120fps。
- `react-native-svg` 画连接线。
- 命中检测改为 memo 化的 chip 矩形碰撞，不用 `elementFromPoint`。

## 分阶段实施（每阶段独立可发布）

### Phase 0 — Workspace 共享层抽取（Web 零回退）
迁移 `lib/{store,snapshot-schema,types,bonus,ledger,utils,tag-colors,version}.ts` 到 `shared/`，工作空间别名 `@tokmato/shared`。改 Next.js 的 import。`shared/store.ts` 加 `storage` 注入参数：web 注入 `localStorage`，RN 后续注入 AsyncStorage。`store.ts:379, 967` 的 `tokmato:v8-just-upgraded` 走同一适配。

**验证**：`bun test`（147 全过）；`bun run build` 类型检查通过；非 store 路由产物哈希不变；手测五条路由无回退。

### Phase 1 — REST RPC 镜像
新 `app/api/rpc/` 路由：`save-cloud`、`load-cloud`、`save-push-subscription`、`remove-push-subscription`、`save-fcm-token`、`remove-fcm-token`、`start-push-chain`、`cancel-push-chain`、`set-active-session`、`clear-active-session`、`get-active-session`、`exchange-github-token`。每条 handler 是对应 server action 函数体的薄包装，鉴权读 `auth()` 或 `Authorization: Bearer`。Web 仍走 server actions，**不双写**。

**验证**：每条 endpoint curl 测试，对照 server action 响应一致；`app/actions/sync.test.ts` 增加 Bearer 路径用例。

### Phase 2 — Expo 骨架 + Auth + Store
`mobile/` 用 Expo managed 起骨架。Expo Router 5 路由对齐 web。AsyncStorage 注入 Zustand。Expo AuthSession PKCE → JWT 通过 `exchange-github-token`。屏幕只渲染 `useStore` 数字，证明共享层跑通。

**验证**：Android 模拟器登录，看到云端 snapshot 拉到 RN store，ftoken / htoken 与 web 一致。

### Phase 3 — 设计系统 + Home / Journey
`globals.css` 令牌 → `mobile/styles/tokens.ts`。Unistyles light / dark。`<EditorialText>` 正则切 CJK。Home（RunningView / RemoteActiveView）和 Journey（FlashList 走账本）。AppState 时钟 resync。

**验证**：手机启动番茄 → 锁屏 5 分钟 → 回来读数正确；FlashList 滚动 60fps（systrace）。

### Phase 4 — 推送
`expo-notifications` 启动时注册，token POST `/api/rpc/save-fcm-token`。前台拿到 push 显示 in-app banner，后台由系统托盘处理。

**验证**：5 分钟番茄 + 锁屏，boundary 后 1-3s 内通知到达（与 `capacitor/EXPERIMENT.md` 同一测法）。

### Phase 5 — Sheets、看板手势、剩余屏幕
`@gorhom/bottom-sheet` 替 ResponsiveSheet。13 个 sheet 全部移植。看板径向菜单走 gesture-handler + reanimated。Settings（推送开关、主题、立即推送/拉取、登出）。

**验证**：端到端流程——登录 → 番茄 → notes sheet → 加看板 → 径向移动 → 结算。中端 Android（Pixel 4a 级）systrace 看手势 60fps。

### Phase 6 — Capacitor 下场
删除 `capacitor/` 目录。更新 `README.md`、`CLAUDE.md`、移除 EXPERIMENT 引用。CI：`.github/workflows/release-apk.yml` 改成 EAS Build 出 AAB+APK。

**验证**：v3.0 GitHub release 附 EAS-built APK，sideload 装得上；`tokmato.nihildigit.dev` 与迁移前 Lighthouse 五路由分数一致。

### Phase 7（可选） — iOS
TestFlight 通过 EAS Build 出，APNs 证书流程。Apple Developer 账号 + 审核摩擦约 3-5 天。本计划不展开。

## 关键文件
- `lib/store.ts`（Zustand persist v8、`todayKey`、`advancePomodoroPhase`、`selectSnapshot`）
- `lib/snapshot-schema.ts`（云同步 Zod schema，平台无关）
- `lib/types.ts`、`lib/bonus.ts`、`lib/ledger.ts`、`lib/utils.ts`
- `auth.ts`（加 Bearer 旁路）
- `app/api/push/fire/route.ts`（双路 fan-out，零修改）
- `app/actions/{sync,push,active-session}.ts`（Phase 1 镜像为 REST）
- `app/globals.css`（令牌源，复制到 `mobile/styles/tokens.ts`）
- `app/kanban/page.tsx`（径向菜单参考实现）
- `components/home/RunningView.tsx`、`components/play/EntertainmentRunningView.tsx`（时钟逻辑参考）
- `components/ui/responsive-sheet.tsx` + `components/sheets/*.tsx`（sheet 系统参考）
- `lib/push-client.ts`（Capacitor 分支被 Expo 替换）
- `capacitor/EXPERIMENT.md`（迁移动机历史）

## 已确认接受的取舍
1. Web 性能不会因此变好，目标只覆盖原生触屏与原生通知工程化收敛。
2. 维持两套 UI（28 web + ~30 RN），新功能成本约 1.7×。
3. CJK 楷体回退在 RN 走正则切串，混合脚本下不与 web 像素级一致。
4. iOS 不在本计划范围（Phase 7 留作可选入口，不展开 APNs / EAS iOS 配置）。
5. RN 客户端走 Bearer JWT，与 web 的 cookie session 模型分叉；`app/actions/sync.ts` 已按 `user.id` 分键，KV 命名空间不变。
