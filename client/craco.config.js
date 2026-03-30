const { addPostcssPlugin } = require('@craco/craco');

module.exports = {
  plugins: [
    {
      plugin: {
        overrideWebpackConfig: ({ webpackConfig, context }) => {
          // Find the PostCSS loader and add tailwindcss
          const oneOfRule = webpackConfig.module.rules.find(rule => rule.oneOf);
          if (oneOfRule) {
            oneOfRule.oneOf.forEach(rule => {
              if (rule.use) {
                rule.use.forEach(loader => {
                  if (
                    loader.loader &&
                    loader.loader.includes('postcss-loader')
                  ) {
                    const postcssOptions = loader.options?.postcssOptions;
                    if (postcssOptions) {
                      const existingPlugins = postcssOptions.plugins || [];
                      postcssOptions.plugins = [
                        require('tailwindcss'),
                        require('autoprefixer'),
                        ...existingPlugins,
                      ];
                    }
                  }
                });
              }
            });
          }
          return webpackConfig;
        },
      },
    },
  ],
};
