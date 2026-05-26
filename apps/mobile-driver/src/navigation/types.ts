export type RootStackParamList = {
  SignIn: undefined;
  MainTabs: undefined;
  ActiveTrip: { tripId: string };
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
