/**
 * Auth Dialog - Chạy trong Office Dialog (displayDialogAsync)
 * Dùng MSAL redirect flow, sau khi login xong gửi token về TaskPane qua messageParent
 */

import { PublicClientApplication } from '@azure/msal-browser';

const MSAL_CLIENT_ID = '6a71bcce-b6c7-493a-a23d-c9bdcfaaee78';
const MSAL_SCOPES = ['Files.ReadWrite', 'User.Read'];

const msalInstance = new PublicClientApplication({
  auth: {
    clientId: MSAL_CLIENT_ID,
    authority: 'https://login.microsoftonline.com/common',
    redirectUri: 'https://pulpcorn.github.io/email-attachment-helper/src/taskpane/auth-dialog.html',
  },
  cache: {
    cacheLocation: 'localStorage',
  },
});

async function run(): Promise<void> {
  await msalInstance.initialize();

  // Xử lý redirect callback
  const response = await msalInstance.handleRedirectPromise();

  if (response && response.accessToken) {
    // Đã login xong → gửi token về TaskPane
    Office.context.ui.messageParent(JSON.stringify({
      status: 'success',
      token: response.accessToken,
    }));
    return;
  }

  // Chưa login → redirect đến Microsoft login
  const accounts = msalInstance.getAllAccounts();
  if (accounts.length > 0) {
    // Đã có account → lấy token silent
    try {
      const result = await msalInstance.acquireTokenSilent({
        scopes: MSAL_SCOPES,
        account: accounts[0],
      });
      Office.context.ui.messageParent(JSON.stringify({
        status: 'success',
        token: result.accessToken,
      }));
      return;
    } catch {
      // Silent fail → redirect
    }
  }

  // Redirect đến trang login Microsoft
  await msalInstance.acquireTokenRedirect({
    scopes: MSAL_SCOPES,
  });
}

// Chờ Office ready rồi chạy
Office.onReady(() => {
  run().catch((error) => {
    console.error('[Email Helper] Auth dialog error:', error);
    Office.context.ui.messageParent(JSON.stringify({
      status: 'error',
      error: error.message || 'Đăng nhập thất bại',
    }));
  });
});
