# 🔐 Google · Apple 로그인 + 모든 기기 클라우드 이어하기 + 실시간 랭킹 설정 가이드

## 1. Realtime Database 규칙(Rules) — **모든 기기 데이터 이어하기 + 전체 유저 랭킹 필수!**
Firebase 콘솔 → **빌드 → Realtime Database → 규칙(Rules)** 탭에 아래 JSON을 그대로 붙여넣고 **게시** 버튼을 눌러주세요!

```json
{
  "rules": {
    "weekly_boards": {
      "$weekKey": {
        ".read": true,
        "$uid": {
          ".write": "auth != null && auth.uid === $uid && (!data.exists() || newData.child('score').val() >= data.child('score').val())",
          ".validate": "newData.hasChildren(['uid', 'nickname', 'provider', 'score', 'updatedAt']) && newData.child('uid').val() === $uid && (newData.child('provider').val() === 'google' || newData.child('provider').val() === 'apple') && newData.child('score').isNumber() && newData.child('score').val() > 0 && newData.child('score').val() < 5000000 && newData.child('nickname').isString() && newData.child('nickname').val().length <= 12"
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
> - `weekly_boards`: 로그인한 모든 Google/Apple 실제 유저가 서로의 실시간 랭킹을 보고 본인 최고 점수를 등록합니다. (게스트는 차단)
> - `user_saves`: 로그인한 본인(`auth.uid === $uid`)만 읽고 쓸 수 있는 개인 클라우드 저장소입니다. **이 규칙을 게시하면 폰·PC·크롬·사파리 어디서 같은 계정으로 로그인해도 골드·보석·스킨·기록이 그대로 이어집니다!**

---

## 2. Apple 로그인 활성화 (2가지 중 선택)
Firebase 콘솔 → **빌드 → Authentication → Sign-in method** 탭:
1. **무료 즉시 사용 (추천!):** **이메일/비밀번호**를 클릭해 **사용 설정 ON → 저장**하면, 게임에서 **Apple 로그인** 클릭 시 Apple ID 이메일+비밀번호로 즉시 로그인·자동 가입되며 모든 기기에서 클라우드 데이터와 실시간 랭킹이 연동됩니다!
2. **Apple 공식 원터치 OAuth 팝업 (Apple Developer 유료 계정 보유 시):** 같은 탭에서 **Apple**을 켜고 Apple Developer의 Services ID / Team ID / Key ID / `.p8` 개인키와 Return URL(`https://korean-weather-survival.firebaseapp.com/__/auth/handler`)을 입력하면 원터치 Apple 로그인 팝업이 열립니다.
3. **승인된 도메인 확인:** **Authentication → 설정 → 승인된 도메인**에 **`gunhe7.github.io`**가 포함되어 있어야 합니다.
