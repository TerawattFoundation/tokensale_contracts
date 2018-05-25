const config = require('../config.js')

const LedToken = artifacts.require('./LedToken.sol');
const TokenSale = artifacts.require('./TokenSale.sol');
const TokenFactory = artifacts.require('./TokenFactory.sol')

let wallet, gas, gasPrice;


module.exports = function(deployer) {

    if (deployer.network == "ethereum") {
      wallet = config.addresses.ethereum.WALLET_ADDRESS
      gas = config.constants.MAX_GAS
      gasPrice = config.constants.DEFAULT_HIGH_GAS_PRICE
    } else if (deployer.network == "ropsten") {
      wallet = config.addresses.ropsten.WALLET_ADDRESS
      gas = config.constants.DEFAULT_GAS
      gasPrice = config.constants.DEFAULT_HIGH_GAS_PRICE
    } else if (deployer.network == "rinkeby") {
      wallet = config.addresses.rinkeby.WALLET_ADDRESS
      gas = config.constants.MAX_GAS
      gasPrice = config.constants.DEFAULT_HIGH_GAS_PRICE
    } else if (deployer.network == "development") {
      wallet = config.addresses.development.WALLET_ADDRESS
      gas = config.constants.MAX_GAS
      gasPrice = config.constants.DEFAULT_GAS_PRICE
    } else {
      throw new Error("Wallet not set")
    }

    deployer.deploy(
        TokenFactory,
        {gas: gas, gasPrice: gasPrice }
      )
    .then(function() {
      return deployer.deploy(
        LedToken,
        TokenFactory.address,
        "0x0000000000000000000000000000000000000000",
        0,
        "Led Token",
        "LED",
        {gas: gas, gasPrice: gasPrice }
      )
    }).then(function() {
      return deployer.deploy(
        TokenSale,
        LedToken.address,
          1525780800,   // November 1st 1PM GMT: 1509541200
          1528459200,   // December 1st 1PM GMT: 1512133200
        {gas: gas, gasPrice: gasPrice }
      )
    }).then(function () {
        process.exit(0)
    })
  }



