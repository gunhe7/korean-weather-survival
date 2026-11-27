# 실시간 온라인 랭킹 & 데이터베이스 보안 설정 가이드

이 프로젝트는 **Firebase Realtime Database**를 사용하여 로그인한 실제 유저(Google/Apple)의 주간 랭킹, 오늘의 날씨 랭킹, 트로피 랭킹, 친구 및 경쟁전 매칭 데이터를 동기화합니다.

> **보안 주의**: 인증 없이 쓰기를 허용하는 규칙(`".write": "!data.exists() || ..."`)은 타인 계정 변조 및 데이터 오염 위험이 있으므로 절대 사용하지 마세요.

## 보안 규칙 게시 방법

1. [Firebase 콘솔](https://console.firebase.google.com/) -> **빌드 -> Realtime Database -> 규칙(Rules)** 탭으로 이동합니다.
2. 저장소 루트의 `database.rules.json` 파일 전체 내용을 그대로 복사해 붙여넣고 **게시(Publish)** 버튼을 클릭합니다.
3. Cloud Firestore를 사용하는 경우에도 저장소 루트의 `firestore.rules`(전체 접근 거부)를 함께 게시하여 테스트 모드 노출을 차단하세요.

자세한 인증·도메인·API 키 제한 절차는 `AUTH_SETUP.md`를 참고하세요.
