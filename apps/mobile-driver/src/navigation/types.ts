export type RootStackParamList = {
  SignIn: undefined;
  ForgotPassword: undefined;
  ResetPassword: { phone: string; resetToken: string };
  MainTabs: undefined;
  ActiveTrip: { tripId: string };
  ActiveDelivery: { deliveryId: string };
  WalletCheckout: { authorizationUrl: string; reference: string; walletTransactionId?: string };
  EditProfile: undefined;
  Wallet: undefined;
};

export type MainTabsParamList = {
  RideDispatch: undefined;
  DeliveryDispatch: undefined;
  Earnings: undefined;
  KYC: undefined;
  Profile: undefined;
};
