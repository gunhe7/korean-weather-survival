# Google · Apple 로그인 + 클라우드 저장 + 실시간 랭킹 보안 설정 가이드

## 1. Firebase Realtime Database 보안 규칙 적용 (필수)

이 프로젝트는 Cloud Firestore가 아니라 **Firebase Realtime Database**를 사용합니다.
루트 디렉터리의 `database.rules.json` 파일에 아래 보안 정책이 정의되어 있습니다.

- **기본 차단(Default Deny)**: 루트(`.read: false`, `.write: false`)에서 허용된 경로 외 모든 접근을 차단합니다.
- **`/user_saves/$uid`**: 로그인한 본인(`auth != null && auth.uid === $uid`)만 읽고 쓸 수 있으며, 삭제를 방지하고 골드·보석·트로피·점수·캐릭터 레벨(1~5)·상자·부스터·프로필 색상/장식의 타입, 음수 금지, 최대치 및 1회 급등 한도를 검증합니다.
- **`/weekly_boards/$weekKey/$uid` (및 `/weekly_boards_v2/$weekKey/$uid`)**: 로그인한 본인(`auth.uid === $uid`, Google/Apple 계정)만 쓰기 가능하며, `email`/`photoURL` 저장을 명시적으로 금지하고 XSS/CSS 인젝션 문자(`<`, `>`, 비정상 `nameColor` 등) 및 점수·트로피 이상치를 차단합니다.

### 적용 방법
1. **Firebase 콘솔 수동 게시**: Firebase 콘솔 -> **빌드 -> Realtime Database -> 규칙(Rules)** 탭으로 이동하여 `database.rules.json` 전체 내용을 붙여넣고 **게시(Publish)** 클릭.
2. **Firebase CLI 배포**:
   ```bash
   firebase deploy --only database,firestore:rules
   ```
3. **Cloud Firestore 차단**: Firestore를 사용하지 않으므로 `firestore.rules`의 전체 거부(`allow read, write: if false;`) 규칙도 함께 유지하세요.

---

## 2. Authentication 및 승인된 도메인 설정

Firebase 콘솔 -> **빌드 -> Authentication**:
1. **Sign-in method**: Google 로그인을 활성화합니다. (불필요한 추가 OAuth Scope는 요청하지 않으며 기본 프로필·이메일만 최소 요청합니다.)
2. **승인된 도메인(Settings -> Authorized domains)**: 실제 배포 도메인(`gunhe7.github.io`, `korean-weather-survival.firebaseapp.com`)만 남기고 불필요한 테스트/임시 도메인은 제거합니다.

---

## 3. Google Cloud API 키 제한 (권장)

1. [Google Cloud 콘솔 -> API 및 서비스 -> 사용자 인증 정보](https://console.cloud.google.com/apis/credentials)에서 Firebase 웹 API 키를 선택합니다.
2. **애플리케이션 제한사항**을 **웹사이트(HTTP 리퍼러)**로 설정하고 아래 주소만 허용합니다.
   - `https://gunhe7.github.io/*`
   - `https://korean-weather-survival.firebaseapp.com/*`
3. **API 제한사항**에서 Firebase Authentication / Realtime Database 관련 필수 API만 허용합니다.
