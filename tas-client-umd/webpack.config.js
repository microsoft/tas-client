const path = require('path');

module.exports = {
    entry: 'tas-client',
    devtool: 'source-map',
    mode: 'production',
    output: {
        path: path.resolve(__dirname, 'lib'),
        filename: 'tas-client-umd.js',
        libraryTarget: 'umd',
        globalObject: 'typeof self !== \'undefined\' ? self : this'
    }
};
