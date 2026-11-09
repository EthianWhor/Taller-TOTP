export interface TokenResponse {
  token_type: 'Bearer';
  access_token: string;
  expires_in: number;
  refresh_token: string;
  refresh_expires_in: number;
}

export interface MeResponse {
  id: string;
  email: string;
  name: string;
  session: { mfa_verified: boolean; expires_at: number };
}

export interface StepUpRequired {
  error: 'mfa_required';
  error_description: string;
  step_up_token: string;
  step_up_expires_in: number;
}

export interface MfaVerifyResponse {
  token_type: 'Bearer';
  elevated_token: string;
  expires_in: number;
  mfa_verified: true;
}

export interface VaultResponse {
  resource: string;
  owner: string;
  accessed_at: string;
  elevated_until: string;
  secrets: Array<{ label: string; value: string }>;
}
