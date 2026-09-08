module.exports = {
    plugins: {
      autoprefixer: {},
      // Remove postcss-preset-env to avoid calc processing errors
      // It was causing issues with Shopify Polaris CSS
    },
  };
  