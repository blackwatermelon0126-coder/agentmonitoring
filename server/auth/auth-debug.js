/**
 * 임시 디버그 스크립트 — MSAL Device Code Flow 에러 직접 출력
 * 사용: node auth/auth-debug.js
 */
import '../loadEnv.js';
import { PublicClientApplication } from '@azure/msal-node';

const CLIENT_ID = process.env.AZURE_CLIENT_ID || 'c33608da-f7ed-40e5-ab28-c767f08a1d47';
const TENANT_ID = process.env.AZURE_TENANT_ID || '7626d4cb-4eb7-40ae-96db-5fd0b9c7db8f';

const SCOPES = ['Chat.Read', 'Chat.ReadBasic', 'Calendars.Read', 'offline_access', 'User.Read', 'User.Read.All'];

const pca = new PublicClientApplication({
    auth: { clientId: CLIENT_ID, authority: `https://login.microsoftonline.com/${TENANT_ID}` },
});

console.log('CLIENT_ID :', CLIENT_ID);
console.log('TENANT_ID :', TENANT_ID);
console.log('SCOPES    :', SCOPES.join(', '));
console.log('');

try {
    const result = await pca.acquireTokenByDeviceCode({
        scopes: SCOPES,
        deviceCodeCallback: (response) => {
            console.log('=== 인증 코드 ===');
            console.log('접속 주소 :', response.verificationUri);
            console.log('입력 코드 :', response.userCode);
            console.log('');
            console.log('위 주소에서 코드 입력 후 Enter 기다리는 중...');
        },
    });

    console.log('');
    console.log('=== 인증 성공 ===');
    console.log('account  :', result.account?.username);
    console.log('scopes   :', result.scopes?.join(', '));
    console.log('expiresOn:', result.expiresOn);
} catch (err) {
    console.error('');
    console.error('=== 인증 실패 ===');
    console.error('errorCode       :', err.errorCode);
    console.error('errorMessage    :', err.errorMessage);
    console.error('subError        :', err.subError);
    console.error('correlationId   :', err.correlationId);
    console.error('full error      :', err.message);
}
