import { BigNumber } from "@ethersproject/bignumber";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai, { expect } from "chai";
import hre, { ethers } from "hardhat";
import { Gasless } from "../typechain";

const COINBASE = "0xC014BA5EC014ba5ec014Ba5EC014ba5Ec014bA5E";

import { solidity } from "ethereum-waffle";

chai.use(solidity);

describe("Gasless", function () {
  let deployer: SignerWithAddress;
  let user: SignerWithAddress;
  let miner: SignerWithAddress;
  let alien: SignerWithAddress;
  let gasless: Gasless;

  this.beforeAll(async () => {
    [deployer, user, alien] = await ethers.getSigners();

    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [COINBASE],
    });

    miner = await ethers.getSigner(COINBASE);
  });

  this.beforeEach(async () => {
    const Gasless = await ethers.getContractFactory("Gasless");
    gasless = await Gasless.deploy();
    await gasless.deployed();

    await hre.network.provider.request({
      method: "hardhat_setBalance",
      params: [COINBASE, ethers.utils.parseEther("10000").toHexString().replace("0x0", "0x")],
    });

    await hre.network.provider.request({
      method: "hardhat_setBalance",
      params: [await user.getAddress(), "0x0"],
    });
  });

  it("Miner can subsidize user", async function () {
    const userBalanceBefore = await user.getBalance();
    const subsidyAmount = ethers.utils.parseEther("0.1");

    await gasless.connect(miner).subsidizeGas(await user.getAddress(), subsidyAmount, { value: subsidyAmount });

    const userBalanceAfter = await user.getBalance();
    expect(userBalanceAfter.sub(userBalanceBefore)).to.equal(subsidyAmount);
  });

  it("Non-Miner cannot subsidize user", async function () {
    const subsidyAmount = ethers.utils.parseEther("0.1");

    await expect(gasless.connect(alien).subsidizeGas(await user.getAddress(), subsidyAmount, { value: subsidyAmount })).to.be.revertedWith(
      "You're not a miner of the block",
    );
  });

  it("User can refund miner with ETH", async function () {
    await hre.network.provider.request({
      method: "hardhat_setBalance",
      params: [await user.getAddress(), ethers.utils.parseEther("100").toHexString().replace("0x0", "0x")],
    });

    const minerBalanceBefore = await miner.getBalance();
    const userBalanceBefore = await user.getBalance();
    const refundAmount = ethers.utils.parseEther("10");

    await gasless.connect(user).refundToMiner(ethers.constants.AddressZero, refundAmount, { value: refundAmount });

    const minerBalanceAfter = await miner.getBalance();
    const userBalanceAfter = await user.getBalance();

    expect(userBalanceBefore.sub(userBalanceAfter)).to.be.gte(refundAmount);
    expect(minerBalanceAfter.sub(minerBalanceBefore)).to.be.gte(refundAmount);
  });
});
