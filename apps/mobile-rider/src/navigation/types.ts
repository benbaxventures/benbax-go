export type RootStackParamList = {
  SignIn: undefined;
  MainTabs: undefined;
  ActiveDelivery: { deliveryId: string };
  WalletCheckout: { authorizationUrl: string; reference: string; walletTransactionId?: string };
  EditProfile: undefined;
  Wallet: undefined;
};

export type MainTabsParamList = {
  Dispatch: undefined;
  Earnings: undefined;
  KYC: undefined;
  Profile: undefined;
};
