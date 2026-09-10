try {
  const { default: husky } = await import('husky');
  husky();
} catch (error) {
  if (error instanceof Error && error.code === 'ERR_MODULE_NOT_FOUND') {
    process.exit(0);
  }
  throw error;
}
