# 🏆 실제 유저 실시간 온라인 랭킹 서버 연결 가이드 (무료 · 3분 완성)

현재 게임은 **가짜 봇/NPC를 모두 제거하고 실제 유저 기록만 표시**합니다.  
GitHub Pages는 정적 웹 호스팅이므로, **서로 다른 스마트폰·PC의 모든 실제 유저 점수를 실시간으로 공유**하려면 무료 **Firebase Realtime Database** 주소 1줄만 연결하면 됩니다!

---

## 1단계. Firebase 무료 프로젝트 & Realtime Database 생성 (2분)
1. [Firebase 콘솔](https://console.firebase.google.com/)에 구글 계정으로 로그인 → **프로젝트 만들기** 클릭
2. 왼쪽 메뉴 **빌드 → Realtime Database → 데이터베이스 만들기** 클릭
3. 위치 선택: **`싱가포르 (asia-southeast1)`** (한국에서 가장 빠름!)
4. 보안 규칙은 일단 **잠금 모드**로 생성 후, 상단 **규칙(Rules)** 탭에 아래 규칙을 붙여넣고 **게시** 클릭:

```json
{
  "rules": {
    "weekly_boards": {
      "$weekKey": {
        ".read": true,
        "$uid": {
          ".write": "!data.exists() || newData.child('score').val() >= data.child('score').val()",
          ".validate": "newData.hasChildren(['uid', 'nickname', 'score', 'updatedAt']) && newData.child('uid').val() === $uid && newData.child('score').isNumber() && newData.child('score').val() > 0 && newData.child('score').val() < 5000000 && newData.child('nickname').isString() && newData.child('nickname').val().length <= 12"
        }
      }
    }
  }
}
```
> 위 규칙 덕분에 누구나 실시간 순위를 읽고 본인 최고 점수를 등록할 수 있지만, **기존 기록을 삭제하거나 비정상 점수(500만점 이상)를 조작할 수는 없습니다.**

---

## 2단계. 게임에 DB 주소 1줄 붙여넣기 (30초)
1. Firebase Realtime Database 화면 상단에 표시되는 URL을 복사합니다.  
   (예: `https://korean-weather-survival-default-rtdb.asia-southeast1.firebasedatabase.app`)
2. `js/online.js` 파일 10번째 줄의 `DEFAULT_FIREBASE_DB_URL`에 붙여넣거나, 저에게 그 URL을 알려주시면 바로 적용·배포해 드립니다!

```js
const DEFAULT_FIREBASE_DB_URL = 'https://여기에-복사한-주소-붙여넣기.firebasedatabase.app';
```

연결 즉시 모든 스마트폰의 랭킹 화면이 **`● LIVE 서버`**로 전환되며, 전 세계 실제 유저들의 주간 점수가 5초마다 실시간 반영되고 매주 월요일 00:00(KST) 실제 1위 유저에게 **💎 500 보석**이 자동 지급됩니다!
