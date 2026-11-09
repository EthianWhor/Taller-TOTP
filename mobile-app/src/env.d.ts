// Expo reemplaza en tiempo de compilación las variables EXPO_PUBLIC_* de process.env.
declare const process: {
  env: {
    readonly EXPO_PUBLIC_API_URL?: string;
    readonly EXPO_PUBLIC_OAUTH_CLIENT_ID?: string;
    readonly NODE_ENV?: string;
  };
};
