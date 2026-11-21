# 📱 한국 날씨에서 살아남기 — 모바일 앱 출시 가이드

이 프로젝트는 **웹(GitHub Pages) + 오프라인 PWA + 안드로이드 네이티브 앱(APK/AAB) + iOS 네이티브 앱(Capacitor)**을 모두 지원하도록 구성되어 있습니다.

---

## 1. 가장 빠른 출시 방법: PWABuilder (PC 설치 없이 30초 만에 APK / Play 스토어 AAB / iOS 생성!)
이 게임은 **오프라인 서비스 워커(`sw.js`) + 스토어 규격 `manifest.json` + 512px 아이콘 + 개인정보처리방침**이 모두 완벽하게 적용된 정식 PWA입니다.

1. [PWABuilder](https://www.pwabuilder.com/) 접속
2. 주소창에 게임 URL 입력 후 **Start** 클릭:  
   `https://gunhe7.github.io/korean-weather-survival/`
3. **Package For Stores** 클릭 → 원하는 스토어 선택:
   - **Android (Google Play Store):** 서명된 `.aab` + 테스트용 `.apk` 즉시 다운로드!
   - **iOS (Apple App Store):** Xcode iOS 프로젝트 패키지 즉시 다운로드!

> 패키지 ID: `com.gunhe7.kweathersurvival` / 가로 화면 고정 / 풀스크린 몰입 모드가 자동 적용됩니다.

---

## 2. 네이티브 앱 직접 빌드 (Capacitor 6 — Android & iOS)
Node.js + Android Studio (또는 Mac Xcode)가 설치된 환경에서 네이티브 앱으로 직접 빌드할 수 있습니다:

```bash
npm install
npm run android:add   # 안드로이드 프로젝트 생성 + 오프라인 번들 동기화
npm run android:open  # Android Studio 열기 → Build > Generate Signed Bundle / APK
```

> **클라우드 자동 빌드(선택):** GitHub 저장소 → **Actions** 탭 → **New workflow**에서 `scripts/github-actions-build-mobile.yml` 내용을 붙여 넣으면 GitHub 서버에서 매번 `.apk`와 `.aab`가 자동 빌드됩니다.

---

## 2. Google Play 스토어 정식 출시 절차
1. [Google Play Console](https://play.google.com/console)에서 개발자 계정 등록 (1회 \$25)
2. 새 앱 만들기 → 앱 이름: `한국 날씨에서 살아남기`, 패키지명: `com.gunhe7.kweathersurvival`
3. **개인정보처리방침 URL** 입력 (이미 호스팅 완료):  
   `https://gunhe7.github.io/korean-weather-survival/privacy-policy.html`
4. 앱 아이콘 업로드: `assets/icons/icon-512.png`
5. 서명된 `.aab` 업로드 (로컬 Android Studio에서 `npx cap add android && npx cap open android` → `Build > Generate Signed Bundle / APK`로 서명 키 생성 및 업로드)

---

## 3. Apple App Store (iOS) 출시 절차
Mac + Xcode 환경에서:
```bash
npm install
npm run ios:add
npm run ios:open
```
1. Xcode에서 Signing & Capabilities → Apple Developer 팀 선택 (`Bundle Identifier`: `com.gunhe7.kweathersurvival`)
2. Deployment Info → Device Orientation에서 **Landscape Left / Landscape Right**만 체크
3. `Product > Archive` → App Store Connect 업로드

---

## 4. 스토어 심사 없이 지금 바로 폰에 앱처럼 설치하기 (PWA)
- **안드로이드 Chrome:** `https://gunhe7.github.io/korean-weather-survival/` 접속 → 우측 상단 메뉴 `⋮` → **홈 화면에 추가 / 앱 설치**
- **아이폰 Safari:** 사이트 접속 → 하단 공유 버튼 → **홈 화면에 추가**
- 서비스 워커(`sw.js`)가 적용되어 **오프라인에서도 실행**됩니다.
