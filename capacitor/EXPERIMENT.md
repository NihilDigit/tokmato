# tokmato 的 Capacitor 套壳

时间：2026-05-04
目标：Web Push 在锁屏 Android 上吃 Doze 延迟（锁屏后通知压到下次亮屏才放出来）。这套 Capacitor 壳走原生 FCM `priority:high` 透 Doze，在 native 路径上拿到接近实时的通知；Web Push 仍然在浏览器/PWA 上工作。

## 仓库布局

```
tokmato/
├── capacitor/                          ← 这一坨，APK 工程
│   ├── capacitor.config.ts             server.url 指 https://tokmato.nihildigit.dev
│   ├── web/index.html                  本地 fallback 页（远程不可达时显示）
│   ├── android/                        cap add android 生成
│   │   ├── app/google-services.json    Firebase Android 配置（gitignored）
│   │   └── gradle.properties           pinned org.gradle.java.home → JBR 21
│   └── firebase-service-account.json   Admin SDK 凭据（gitignored, chmod 600）
└── lib/fcm.ts                          tokmato 后端 FCM 投递入口（在主仓 lib/ 下）
```

Capacitor 工程跟 web 主仓一起住。两个 package.json 各管各的依赖；node_modules 互不影响。

## 已完成

- 骨架 + Android 平台脚手架，用 JBR 21 build 出 6.6 MB debug APK
- Firebase 项目 `tokmato-19547` 建好，Android app `dev.nihildigit.tokmato` 注册
- `google-services.json` 放进 `capacitor/android/app/`（gitignored）
- Service account JSON 放进 `capacitor/firebase-service-account.json`（gitignored, chmod 600），同时 base64 进 `.env.local` 和 Vercel production env `FIREBASE_SERVICE_ACCOUNT_JSON_B64`
- 后端：`lib/fcm.ts` 用 firebase-admin SDK 发 priority:high 消息，UNREGISTERED 自动归类成 EXPIRED
- 后端：KV 加 `tokmato:user:{id}:fcm:tokens` Hash，按 sha1(token) 分键，多设备并存
- 后端：`saveFcmToken` / `removeFcmToken(token?)` server actions
- 后端：`/api/push/fire` 双路 fan-out（web-push subs + FCM tokens），都 EXPIRED 才结束 chain
- 客户端：`lib/push-client.ts` 检测 `window.Capacitor.isNativePlatform()` 后走原生路径，用 `@capacitor/push-notifications` 注册 + 把 token POST 到 `saveFcmToken`
- 测试：`lib/fcm.test.ts` 加 3 个 case（DISABLED / 初始化 / bogus token）；147 全过

## 还差

1. **CI**：v2.3 release tag 触发 build arm64-v8a APK + 签名 + attach 到 GitHub Release
2. **签名 keystore**：release APK 必须签名才能装，需要生成一次 release keystore，把 keystore 文件 + 密码放到 GitHub repo secrets
3. **装机自测**：sideload APK，登录 GitHub，开"开启推送"按钮，启动一个短时番茄，锁屏，看通知能否在 boundary 时即时弹（不再压到亮屏）

## OAuth 这块没做适配

GitHub OAuth 应该在 WebView 里自然走通：登录跳转 → github.com → 回调 tokmato.nihildigit.dev/api/auth/callback/github → 设 cookie → 主页。WebView 全程在 tokmato.nihildigit.dev 域内，cookie 域匹配。**没装机前是猜测**，装机后可能要补 deep link。

## 怎么 build APK

```bash
cd capacitor
bunx cap sync android       # 同步 web/ 改动 + 插件 manifest 进 android/
cd android
./gradlew assembleDebug      # debug APK，可 sideload 但有效期短
# 或：
./gradlew assembleRelease    # 需要 keystore，build 出可上 Play Store 的 APK
```

## 怎么测原生 push

```bash
# 1. APK sideload 到手机
adb install android/app/build/outputs/apk/debug/app-debug.apk

# 2. 装好后打开应用，登录 GitHub，到 Settings 点"开启推送"
#    应该弹原生权限请求；同意后 token 静默 POST 给后端

# 3. 后端 KV 验证（开发机）
set -a; source ../../.env.local; set +a
curl -s "$KV_REST_API_URL/hgetall/tokmato:user:github:49825792:fcm:tokens" \
  -H "Authorization: Bearer $KV_REST_API_TOKEN"

# 4. 启动一个 5min 娱乐计时器，锁屏 → 等到点
#    应该在 boundary 之后 1-3 秒内弹通知（不再被 Doze 扣到亮屏）
```
