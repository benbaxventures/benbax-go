export type RootStackParamList = {
  SignIn: undefined;
  MainTabs: undefined;
  Tracking: { deliveryId: string };
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
};

export type MainTabsParamList = {
  Home: undefined;
  Orders: undefined;
  Wallet: undefined;
  Support: undefined;
  Profile: undefined;
};
