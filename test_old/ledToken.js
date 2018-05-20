require('babel-register')
require('babel-polyfill')
require('../scripts/jsHelpers.js')

const fs = require('fs')
const csv = require('csv-parser')

const BigNumber = web3.BigNumber
let chai = require('chai')
var chaiAsPromised = require('chai-as-promised')
var chaiStats = require('chai-stats')
var chaiBigNumber = require('chai-bignumber')(BigNumber)
chai.use(chaiAsPromised).use(chaiBigNumber).use(chaiStats).should()

import moment from 'moment'

import {
  DEFAULT_GAS,
  DEFAULT_GAS_PRICE,
  TOKENS_ALLOCATED_TO_LED
} from '../scripts/testConfig.js'

import {
  getAddress,
  expectInvalidOpcode,
  latestTime,
  increaseTime
} from '../scripts/helpers.js'

import {
  transferControl
} from '../scripts/controlHelpers.js'

import {
  getTokenBalance,
  getTokenBalanceAt,
  getTotalSupply,
  getTotalSupplyAt,
  mintToken,
  getController,
  transferToken,
  transferTokenFrom,
  approve,
  getAllowance,
  importBalances,
  lockBalances
} from '../scripts/tokenHelpers.js'

import {
  enableTransfers,
  lockTransfers
} from '../scripts/tokenSaleHelpers.js'

const assert = chai.assert
const should = chai.should()
const expect = chai.expect

const LedPresaleToken = artifacts.require('./LedPresaleToken.sol')
const LedToken = artifacts.require('./LedToken.sol')
const TokenSale = artifacts.require('./TokenSale.sol')

contract('ledToken', (accounts) => {
  let tokenSale
  let tokenSaleAddress
  let ledToken
  let ledPresaleToken
  let ledTokenAddress

  let fund = accounts[0]
  let sender = accounts[1]
  let receiver = accounts[2]
  let hacker = accounts[3]
  let wallet = accounts[4]

  let startTime
  let endTime
  let contractUploadTime

  beforeEach(async function() {


    ledPresaleToken = await LedPresaleToken.new()

    ledToken = await LedToken.new(
      '0x0',
      '0x0',
      0,
      'Led Token Test',
      'PRFT Test'
    )

    ledTokenAddress = await getAddress(ledToken)

    contractUploadTime = latestTime()
    startTime = contractUploadTime.add(1, 'day').unix()
    endTime = contractUploadTime.add(31, 'day').unix()

    tokenSale = await TokenSale.new(
      ledTokenAddress,
      startTime,
      endTime
    )

    tokenSaleAddress = await getAddress(tokenSale)
  })

  describe('Initial State', function () {
    beforeEach(async function() {
      await transferControl(ledToken, fund, tokenSaleAddress)
      await increaseTime(moment.duration(1.01, 'day'))
    })

    it('should initially be controlled by the token sale contract', async function() {
      let ledTokenOwner = await getController(ledToken)
      ledTokenOwner.should.be.equal(tokenSaleAddress)
    })

    it('should have 18 decimals', async function() {
      let decimals = await ledToken.decimals.call()
      decimals.should.be.bignumber.equal(18)
    })

    it('should have Led Token Name', async function() {
      let name = await ledToken.name.call()
      name.should.be.equal('Led Token')
    })

    it('should have PRFT symbol', async function() {
      let symbol = await ledToken.symbol.call()
      symbol.should.be.equal('PRFT')
    })
  })

  describe('Import balances', function () {
    it('should correctly import a few balances', async function() {
      let addresses = [sender, receiver]
      let balances = [100, 100]
      await importBalances(ledToken, fund, addresses, balances)

      let senderBalance = await getTokenBalance(ledToken, sender)
      let receiverBalance = await getTokenBalance(ledToken, receiver)

      senderBalance.should.be.equal(100)
      receiverBalance.should.be.equal(100)
    })

    it('should correctly import balances from a CSV file', async function() {
      let addresses = []
      let balances = []

      const writeData = new Promise((resolve, reject) => {
        fs.createReadStream('./test/balances.csv')
          .pipe(csv())
          .on('data', function (data) {
            addresses.push(data['address'])
            balances.push(data['balance'])
          })
          .on('end', resolve)
      })

      await writeData
      balances = balances.toNumber()

      let addressListNumber = addresses.length

      for (let i = 0; i < addressListNumber; i = i + 100) {
        let addressesBatch = addresses.slice(i, i + 100)
        let balancesBatch = balances.slice(i, i + 100)
        await importBalances(ledToken, fund, addressesBatch, balancesBatch)
      }

      for (let i = 0; i < 10; i++) {
        let balance = await getTokenBalance(ledToken, addresses[i])
        balance.should.be.equal(balances[i])
      }
    })

    it('have a total supply equal to the sum of the presale balances and led tokens after importing', async function() {
      let addresses = []
      let balances = []

      const writeData = new Promise((resolve, reject) => {
        fs.createReadStream('./test/balances.csv')
        .pipe(csv())
        .on('data', function (data) {
          addresses.push(data['address'])
          balances.push(data['balance'])
        })
        .on('end', resolve)
      })

      await writeData
      balances = balances.toNumber()

      let addressListNumber = addresses.length
      for (let i = 0; i < addressListNumber; i = i + 100) {
        let addressesBatch = addresses.slice(i, i + 100)
        let balancesBatch = balances.slice(i, i + 100)
        await importBalances(ledToken, fund, addressesBatch, balancesBatch)
      }

      let expectedSupply = balances.sum()
      let supply = await getTotalSupply(ledToken)
      supply.should.be.equal(expectedSupply)
    })

    it('should not import balances if caller is not the owner of the contract', async function() {
      let addresses = []
      let balances = []

      const writeData = new Promise((resolve, reject) => {
        fs.createReadStream('./test/balances.csv')
        .pipe(csv())
        .on('data', function (data) {
          addresses.push(data['address'])
          balances.push(data['balances'])
        })
        .on('end', resolve)
      })

      await writeData
      balances = balances.toNumber()
      await expectInvalidOpcode(importBalances(ledToken, hacker, addresses, balances))
    })

    it('can lock the presale balances', async function() {
      await lockBalances(ledToken, fund).should.be.fulfilled
      let balancesLocked = await ledToken.presaleBalancesLocked.call()
      balancesLocked.should.be.true
    })

    it('can not import presale balances after the presale balances are locked', async function () {
      await lockBalances(ledToken, fund).should.be.fulfilled
      let addresses = [hacker]
      let balances = [100]
      await expectInvalidOpcode(importBalances(ledToken, fund, addresses, balances))

      let balance = await getTokenBalance(ledToken, hacker)
      balance.should.be.equal(0)
    })
  })

  describe('Minting', function () {
    it('should be mintable by owner contract', async function() {
      let initialTokenBalance = await getTokenBalance(ledToken, receiver)
      await mintToken(ledToken, fund, receiver, 100)

      let tokenBalance = await getTokenBalance(ledToken, receiver)
      let balanceIncrease = tokenBalance - initialTokenBalance

      balanceIncrease.should.be.equal(100)
    })

    it('should be mintable', async function() {
      let mintingFinished = await ledToken.mintingFinished.call()
      mintingFinished.should.be.equal(false)
    })

    it('should not be mintable by non-owner', async function() {
      transferControl(ledToken, fund, tokenSaleAddress)

      let initialTokenBalance = await getTokenBalance(ledToken, receiver)

      let params = { from:hacker, gas: DEFAULT_GAS, gasPrice: DEFAULT_GAS_PRICE }
      await expectInvalidOpcode(ledToken.mint(receiver, 100, params))

      let tokenBalance = await getTokenBalance(ledToken, receiver)
      let balanceIncrease = tokenBalance - initialTokenBalance

      balanceIncrease.should.be.equal(0)
    })

    it('can not be stopped by non-owner', async function() {
      transferControl(ledToken, fund, tokenSaleAddress)

      let params = { from: hacker, gas: DEFAULT_GAS, gasPrice: DEFAULT_GAS_PRICE }
      await expectInvalidOpcode(ledToken.finishMinting(params))

      let mintingFinished = await ledToken.mintingFinished.call()
      mintingFinished.should.be.equal(false)
    })
  })

  describe('Transfers', function () {

    beforeEach(async function() {
      await mintToken(ledToken, fund, sender, 10000)
      await transferControl(ledToken, fund, tokenSaleAddress)


    })

    it('should be transferable', async function() {
      await enableTransfers(tokenSale, fund)
      let initialSenderBalance = await getTokenBalance(ledToken, sender)
      let initialReceiverBalance = await getTokenBalance(ledToken, receiver)

      await transferToken(ledToken, sender, receiver, 10000)

      let senderBalance = await getTokenBalance(ledToken, sender)
      let receiverBalance = await getTokenBalance(ledToken, receiver)

      let senderBalanceVariation = senderBalance - initialSenderBalance
      let receiverBalanceVariation = receiverBalance - initialReceiverBalance

      senderBalanceVariation.should.be.equal(-10000)
      receiverBalanceVariation.should.be.equal(10000)
    })

    it('should not allow to transfer more than balance', async function() {
      await enableTransfers(tokenSale, fund)
      let params = { from: sender, gas: DEFAULT_GAS, gasPrice: DEFAULT_GAS_PRICE }
      await expectInvalidOpcode(ledToken.transfer(receiver, 10001, params))
    })

    it('tokens should not be transferable to the token contract (by mistake)', async function() {
      await enableTransfers(tokenSale, fund)
      let params = { from: sender, gas: DEFAULT_GAS, gasPrice: DEFAULT_GAS_PRICE }
      await expectInvalidOpcode(ledToken.transfer(ledTokenAddress, 1000, params))
    })

    it('tokens should not be transferable if transfers are locked', async function() {

      let initialSenderBalance = await getTokenBalance(ledToken, sender)
      let initialReceiverBalance = await getTokenBalance(ledToken, receiver)

      let params = { from: sender, gas: DEFAULT_GAS, gasPrice: DEFAULT_GAS_PRICE }
      await expectInvalidOpcode(ledToken.transfer(sender, 1000, params))

      let senderBalance = await getTokenBalance(ledToken, sender)
      let receiverBalance = await getTokenBalance(ledToken, receiver)

      senderBalance.should.be.equal(initialSenderBalance)
      receiverBalance.should.be.equal(initialReceiverBalance)
    })

    it('transfers can be enabled after the tokensale ends', async function() {
      await increaseTime(moment.duration(32, 'day'))
      await enableTransfers(tokenSale, fund)


      let initialSenderBalance = await getTokenBalance(ledToken, sender)
      let initialReceiverBalance = await getTokenBalance(ledToken, receiver)

      let params = { from: sender, gas: DEFAULT_GAS, gasPrice: DEFAULT_GAS_PRICE }
      await transferToken(ledToken, sender, receiver, 100)

      let senderBalance = await getTokenBalance(ledToken, sender)
      let receiverBalance = await getTokenBalance(ledToken, receiver)

      senderBalance.should.be.equal(initialSenderBalance - 100)
      receiverBalance.should.be.equal(initialReceiverBalance + 100)
    })

    it('transfers can be enabled by controller before the tokensale ends', async function() {
      await enableTransfers(tokenSale, fund)

      let initialSenderBalance = await getTokenBalance(ledToken, sender)
      let initialReceiverBalance = await getTokenBalance(ledToken, receiver)

      let params = { from: sender, gas:DEFAULT_GAS, gasPrice: DEFAULT_GAS_PRICE }
      await transferToken(ledToken, sender, receiver, 100)

      let senderBalance = await getTokenBalance(ledToken, sender)
      let receiverBalance = await getTokenBalance(ledToken, receiver)

      senderBalance.should.be.equal(initialSenderBalance - 100)
      receiverBalance.should.be.equal(initialReceiverBalance + 100)
    })

    it('transfers can not be enabled by non-controller before the tokensale ends', async function() {
      await expectInvalidOpcode(tokenSale.enableTransfers({from: sender}))
    })

    it('transfers can be enabled by anyone after the tokensale ends', async function() {
      await increaseTime(moment.duration(32, 'day'))
      await enableTransfers(tokenSale, receiver)

      let initialSenderBalance = await getTokenBalance(ledToken, sender)
      let initialReceiverBalance = await getTokenBalance(ledToken, receiver)

      let params = { from: sender, gas: DEFAULT_GAS, gasPrice: DEFAULT_GAS_PRICE }
      await transferToken(ledToken, sender, receiver, 100)

      let senderBalance = await getTokenBalance(ledToken, sender)
      let receiverBalance = await getTokenBalance(ledToken, receiver)

      senderBalance.should.be.equal(initialSenderBalance - 100)
      receiverBalance.should.be.equal(initialReceiverBalance + 100)
    })

    it('transfers can not be locked after the tokensale ends', async function() {
      await increaseTime(moment.duration(32, 'day'))
      await enableTransfers(tokenSale, receiver)
      await expectInvalidOpcode(tokenSale.lockTransfers({from: sender}))
    })

    it('transfers')

  })

  describe('Balances: ', function () {

    it('balanceOf should return the proper token holder balance', async function() {
      await mintToken(ledToken, fund, sender, 10000)
      let balance = await getTokenBalance(ledToken, sender)
      balance.should.be.equal(10000)
    })

    it('balanceOfAt should return token holder balance at a previous block', async function() {
      let initialBlock = web3.eth.blockNumber
      await mintToken(ledToken, fund, sender, 10000)
      let currentBlock = web3.eth.blockNumber

      let initialBalance = await getTokenBalanceAt(ledToken, sender, initialBlock)
      let currentBalance = await getTokenBalanceAt(ledToken, sender, currentBlock)

      initialBalance.should.be.equal(0)
      currentBalance.should.be.equal(10000)
    })
  })

  describe('Total Supply: ', function () {
    it('totalSupply should be increase when new tokens are created', async function() {
      let initialSupply = await getTotalSupply(ledToken)
      await mintToken(ledToken, fund, sender, 10 ** 24)

      let supply = await getTotalSupply(ledToken)
      let supplyIncrease = supply - initialSupply
      supplyIncrease.should.be.equal(10 ** 24)
    })

    it('totalSupplyAt should correctly record total supply checkpoints', async function() {
      let firstBlock = web3.eth.blockNumber
      await mintToken(ledToken, fund, sender, 10000)
      let secondBlock = web3.eth.blockNumber
      await mintToken(ledToken, fund, sender, 10000)
      let thirdBlock = web3.eth.blockNumber

      let firstTotalSupply = await getTotalSupplyAt(ledToken, firstBlock)
      let secondTotalSupply = await getTotalSupplyAt(ledToken, secondBlock)
      let thirdTotalSupply = await getTotalSupplyAt(ledToken, thirdBlock)

      firstTotalSupply.should.be.equal(0)
      secondTotalSupply.should.be.equal(10000)
      thirdTotalSupply.should.be.equal(20000)
    })
  })

  describe('transferFrom: ', function () {
    beforeEach(async function() {
      await mintToken(ledToken, fund, sender, 1000)
      await transferControl(ledToken, fund, tokenSaleAddress)
      await enableTransfers(tokenSale, fund)
    })

    it('should throw if no allowance has been given', async function() {
      await expectInvalidOpcode(transferTokenFrom(ledToken, fund, sender, receiver, 1000))
    })

    it('should return correct allowance balance after approve call', async function() {
      await approve(ledToken, sender, receiver, 1000)

      let allowance = await getAllowance(ledToken, sender, receiver)
      allowance.should.be.equal(1000)
    })

    it('should allow transfer if amount is lower than allowance', async function() {
      await approve(ledToken, sender, receiver, 1000)
      await transferTokenFrom(ledToken, receiver, sender, receiver, 1000)

      let receiverBalance = await getTokenBalance(ledToken, receiver)
      let senderBalance = await getTokenBalance(ledToken, sender)

      receiverBalance.should.be.equal(1000)
      senderBalance.should.be.equal(0)
    })

    it('should return an exception if amount is higher than allowance', async function() {
      await approve(ledToken, sender, receiver, 500)
      await expectInvalidOpcode(transferTokenFrom(ledToken, receiver, sender, receiver, 501))

      let receiverBalance = await getTokenBalance(ledToken, receiver)
      let senderBalance = await getTokenBalance(ledToken, sender)

      receiverBalance.should.be.equal(0)
      senderBalance.should.be.equal(1000)
    })

  })
})
