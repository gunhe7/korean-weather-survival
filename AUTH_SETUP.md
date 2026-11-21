# 🔐 실제 Google & Apple 로그인 + 계정별 클라우드 저장 활성화 가이드

현재 코드(`js/online.js`, `index.html`, `js/game.js`)에는 **Firebase 공식 Google 로그인 · Apple ID 로그인 · 계정별 클라우드 저장(`/user_saves/{uid}`) · 게스트 랭킹 제외** 로직이 모두 구현되어 있습니다.

마지막으로 아래 **3가지만 Firebase 콘솔에서 켜주시고 `apiKey` 1줄만 알려주시면** 즉시 실제 구글/애플 로그인이 작동합니다!

---

## 1. Firebase 웹 앱 `apiKey` 복사 (30초)
1. [Firebase 콘솔](https://console.firebase.google.com/project/korean-weather-survival/settings/general) → **프로젝트 설정(⚙️) → 일반** 탭으로 이동
2. 아래쪽 **내 앱**에서 **`</>` (웹 앱 추가)** 클릭 → 이름 `k-weather-web` 입력 → **앱 등록**
3. 나오는 설정 코드에서 **`apiKey: "AIza..."`** 값만 복사해서 저에게 알려주세요!

---

## 2. Google / Apple 로그인 방식 켜기 (1분)
1. 왼쪽 메뉴 **빌드 → Authentication → 시작하기** 클릭
2. **Sign-in method** 탭:
   - **Google** 클릭 → **사용 설정** ON → 지원 이메일 선택 → **저장**
   - **Apple** 클릭 → **사용 설정** ON → (웹에서 Apple 로그인을 쓰려면 Apple Developer Service ID 설정이 필요하며, iOS 네이티브 앱 빌드 시 자동 연동됩니다) → **저장**
3. 같은 Authentication 화면의 **설정(Settings) → 승인된 도메인(Authorized domains)** 탭:
   - **도메인 추가** 클릭 → **`gunhe7.github.io`** 추가!

---

## 3. Realtime Database 보안 규칙 업데이트 (계정별 클라우드 저장 + 게스트 랭킹 차단)
**빌드 → Realtime Database → 규칙(Rules)** 탭에 아래 규칙을 붙여넣고 **게시** 클릭:

```json
{
  "rules": {
    "weekly_boards": {
      "$weekKey": {
        ".read": true,
        "$uid": {
          ".write": "auth != null && auth.uid === $uid && (!data.exists() || newData.child('score').val() >= data.child('score').val())",
          ".validate": "newData.hasChildren(['uid', 'nickname', 'provider', 'score', 'updatedAt']) && newData.child('uid').val() === $uid && (newData.child('provider').val() === 'google' || newData.child('provider').val() === 'apple') && newData.child('score').isNumber() && newData.child('score').val() > 0 && newData.child('score').val() < 5000000"
        }
      }
    },
    "user_saves": {
      "$uid": {
        ".read": "auth != null && auth.uid === $uid",
        ".write": "auth != null && auth.uid === $uid"
      }
    }
  }
}
```

위 1번에서 복사한 **`apiKey` (`AIza...`)만 이 채팅창에 알려주시면**, 제가 `js/online.js` 10번째 줄에 즉시 연결하고 배포까지 완료해 드리겠습니다!
