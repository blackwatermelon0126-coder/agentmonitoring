# Azure AD 앱 등록 + Device Code Flow 사용 가이드

이 문서는 주니어 개발자가 Azure AD 앱을 등록하고,  
AgentMonitor 서버에서 Microsoft Teams 채팅을 읽을 수 있도록 설정하는 절차를 안내한다.

---

## 사전 준비

- Microsoft 365 계정 (Teams 사용 계정)
- [portal.azure.com](https://portal.azure.com) 접근 권한

---

## 1단계: Azure Active Directory → 앱 등록

1. [portal.azure.com](https://portal.azure.com) 접속 후 로그인
2. 상단 검색창에 **"앱 등록"** 입력 → **앱 등록** 클릭
3. **"+ 새 등록"** 클릭

### 앱 정보 입력

| 항목 | 값 |
|:-----|:---|
| 이름 | `AgentMonitor` |
| 지원되는 계정 유형 | **이 조직 디렉터리의 계정만** (단일 테넌트) |
| 리디렉션 URI | 설정 불필요 (Device Code Flow는 리디렉션 URI를 사용하지 않음) |

4. **등록** 버튼 클릭

---

## 2단계: 테넌트 ID / 클라이언트 ID 메모

앱 등록 완료 후 **개요** 화면에서 다음 두 값을 메모한다.

| 항목 | 위치 |
|:-----|:-----|
| **애플리케이션(클라이언트) ID** | 개요 화면 상단 |
| **디렉터리(테넌트) ID** | 개요 화면 상단 |

---

## 3단계: API 권한 추가

1. 좌측 메뉴 → **API 권한** 클릭
2. **"+ 권한 추가"** 클릭
3. **Microsoft Graph** 선택
4. **위임된 권한** 선택 후 다음 4가지 권한을 추가

| 권한 이름 | 설명 |
|:---------|:-----|
| `Chat.Read` | Teams 채팅 메시지 읽기 |
| `Chat.ReadBasic` | 채팅 기본 정보(참여자) 읽기 |
| `offline_access` | 토큰 자동 갱신(리프레시 토큰) |
| `User.Read` | 로그인한 사용자 기본 프로필 |

5. 권한 추가 후 **"[테넌트명]에 대한 관리자 동의 부여"** 버튼 클릭  
   (관리자 계정 필요. 일반 계정이면 관리자에게 동의 요청)

---

## 4단계: 공개 클라이언트 흐름 허용 설정

Device Code Flow를 사용하려면 **공개 클라이언트** 설정이 필요하다.

1. 좌측 메뉴 → **인증** 클릭
2. 페이지 하단 **"고급 설정"** 섹션에서  
   **"공개 클라이언트 흐름 허용"** → **예** 선택
3. **저장** 클릭

> 클라이언트 암호(Secret)는 Device Code Flow에서 **불필요**하다.  
> 암호를 생성하지 않아도 된다.

---

## 5단계: .env 파일 설정

`server/.env.example`을 복사하여 `server/.env`를 생성한다.

```bash
# server 디렉터리에서 실행
cp .env.example .env
```

`.env` 파일을 열어 2단계에서 메모한 값을 입력한다.

```dotenv
AZURE_CLIENT_ID=<2단계에서 메모한 애플리케이션 ID>
AZURE_TENANT_ID=<2단계에서 메모한 테넌트 ID>
AZURE_REDIRECT_URI=http://localhost:3300/auth/callback
```

> `.env` 파일은 `.gitignore`에 포함되어 있으므로 Git에 커밋되지 않는다.

---

## 6단계: Device Code Flow로 인증하기

서버를 시작한 후 브라우저에서 다음 주소에 접근한다.

```
http://localhost:3300/auth/start
```

서버가 다음 형태의 JSON을 반환한다.

```json
{
  "userCode": "ABCD-EFGH",
  "verificationUri": "https://microsoft.com/devicelogin",
  "message": "To sign in, use a web browser to open the page https://microsoft.com/devicelogin and enter the code ABCD-EFGH to authenticate."
}
```

1. **verificationUri** 주소를 브라우저에서 열기 (`https://microsoft.com/devicelogin`)
2. **userCode** 값 입력 (예: `ABCD-EFGH`)
3. Microsoft 계정으로 로그인
4. 권한 동의 화면에서 **수락** 클릭

인증 완료 후 서버가 토큰을 `data/token.json`에 저장한다.

### 인증 상태 확인

```
GET http://localhost:3300/auth/status
```

응답 예시:
```json
{
  "authenticated": true,
  "account": "user@company.com"
}
```

---

## 권한 목록 요약

| 권한 | 유형 | 용도 |
|:-----|:-----|:-----|
| `Chat.Read` | 위임됨 | Teams 채팅 메시지 읽기 |
| `Chat.ReadBasic` | 위임됨 | 채팅 참여자 정보 읽기 |
| `offline_access` | 위임됨 | 리프레시 토큰(자동 갱신) |
| `User.Read` | 위임됨 | 사용자 계정 정보 확인 |

---

## 주의 사항

- `data/token.json`은 액세스 토큰을 포함하므로 외부에 유출되지 않도록 주의한다.  
  (`.gitignore`에 `data/` 패턴으로 추적 제외됨)
- 토큰은 만료 5분 전 서버가 자동으로 갱신한다.
- 오랫동안 서버를 미기동하여 리프레시 토큰도 만료되었다면 `/auth/start`로 재인증한다.
