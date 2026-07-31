export type RootStackParamList = {
  SignIn: undefined;
  ForgotPassword: undefined;
  ResetPassword: { email: string };
  MainTabs: undefined;
  Tracking: { deliveryId: string };
  TripTracking: { tripId: string };
  PaymentCheckout: {
    deliveryId: string;
    authorizationUrl: string;
    reference: string;
  };
  WalletCheckout: {
    authorizationUrl: string;
    reference: string;
    walletTransactionId?: string;
  };
  PrivacyProtection: undefined;
  EditProfile: undefined;
  Notifications: undefined;
};

export type MainTabsParamList = {
  Home: undefined;
  Orders: undefined;
  Wallet: undefined;
  Support: undefined;
  Profile: undefined;
};
