const path = require('path');
const TerserPlugin = require("terser-webpack-plugin");

module.exports = {
    entry: {
        '../app/static/js/tic-tac-toe-script.bundle.min': path.resolve(__dirname, './src/tic-tac-toe-script.js'),
        '../app/static/js/tic-tac-toe-spectate-script.bundle.min': path.resolve(__dirname, './src/tic-tac-toe-spectate-script.js'),
        '../app/static/js/pong-script.bundle.min': path.resolve(__dirname, './src/pong-script.js'),
        '../app/static/js/pong-spectate-script.bundle.min': path.resolve(__dirname, './src/pong-spectate-script.js'),
        '../app/static/js/room-helper.bundle.min': path.resolve(__dirname, './src/room-helper.js')
    },
    mode: 'production',
    module: {
        rules: [
            {
                test: /\.(js)$/,
                exclude: /node_modules/,
                use: ['babel-loader']
            }
        ]
    },
    optimization: {
        minimize: true,
        minimizer: [
          new TerserPlugin({
            extractComments: false,
            terserOptions: {
              format: {
                comments: false,
              },
            },
          }),
        ],
    },
    resolve: {   
        extensions: ['*', '.js']
    },
    output: {
      path: path.resolve(__dirname, '.'),
      filename: '[name].js'
    }
  };