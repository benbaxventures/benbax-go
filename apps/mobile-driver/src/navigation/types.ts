export type RootStackParamList = {
  SignIn: undefined;
  ForgotPassword: undefined;
  ResetPassword: { phone: string; resetToken: string };
  MainTabs: undefined;
  ActiveTrip: { tripId: string };
  EditProfile: undefined;
  Wallet: undefined;
};

export type MainTabsParamList = {
  Dispatch: undefined;
  Earnings: undefined;
  KYC: undefined;
  Profile: undefined;
};
