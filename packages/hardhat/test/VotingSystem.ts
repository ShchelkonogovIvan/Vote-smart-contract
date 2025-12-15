import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("VotingSystem", function () {
  let votingSystem: any;
  let owner: any;
  let user1: any;
  let user2: any;

  beforeEach(async function () {
    [owner, user1, user2] = await ethers.getSigners();
    const VotingSystem = await ethers.getContractFactory("VotingSystem");
    votingSystem = await VotingSystem.deploy();
  });

  describe("Базовые тесты", function () {
    it("Должен развернуться с правильным владельцем", async function () {
      expect(await votingSystem.owner()).to.equal(owner.address);
    });

  });

  describe("Создание голосований", function () {
    it("Владелец может создать голосование", async function () {
      await votingSystem.createPoll("Тест", ["Да", "Нет"], 60);
      expect(await votingSystem.getTotalPolls()).to.equal(1);
    });

    it("Невладелец не может создать голосование", async function () {
      await expect(
        votingSystem.connect(user1).createPoll("Тест", ["Да", "Нет"], 60)
      ).to.be.revertedWith("Not authorized"); 
    });

    it("Нужно минимум 2 варианта", async function () {
      await expect(
        votingSystem.createPoll("Тест", ["Один"], 60)
      ).to.be.revertedWith("At least 2 options required");
    });

    it("Длительность должна быть положительной", async function () {
      await expect(
        votingSystem.createPoll("Тест", ["Да", "Нет"], 0)
      ).to.be.revertedWith("Duration must be positive");
    });
  });

  describe("Голосование", function () {
    beforeEach(async function () {
      await votingSystem.createPoll("Тест", ["Да", "Нет"], 60);
    });

    it("Пользователь может проголосовать", async function () {
      await votingSystem.connect(user1).vote(0, 0);
      
      const results = await votingSystem.getResults(0);
      expect(results.totalVotes).to.equal(1);
    });

    it("Нельзя проголосовать дважды", async function () {
      await votingSystem.connect(user1).vote(0, 0);
      
      await expect(
        votingSystem.connect(user1).vote(0, 1)
      ).to.be.revertedWith("Already voted");
    });

    it("Нельзя голосовать за несуществующий вариант", async function () {
      await expect(
        votingSystem.connect(user1).vote(0, 5)
      ).to.be.revertedWith("Invalid option");
    });

    it("Нельзя голосовать после окончания времени", async function () {

      await time.increase(2 * 60 * 60);
      
      await expect(
        votingSystem.connect(user1).vote(0, 0)
      ).to.be.revertedWith("Poll has ended");
    });

    it("Нельзя голосовать в неактивном голосовании", async function () {
      await votingSystem.endPoll(0);
      
      await expect(
        votingSystem.connect(user1).vote(0, 0)
      ).to.be.revertedWith("Poll is not active");
    });
  });

  describe("Завершение голосования", function () {
    beforeEach(async function () {
      await votingSystem.createPoll("Тест", ["Да", "Нет"], 60);
    });

    it("Владелец может завершить голосование", async function () {
      await votingSystem.endPoll(0);
      
      const pollInfo = await votingSystem.getPollInfo(0);
      expect(pollInfo.isActive).to.equal(false);
    });

    it("Невладелец не может завершить голосование", async function () {
      await expect(
        votingSystem.connect(user1).endPoll(0)
      ).to.be.revertedWith("Not authorized"); 
    });

    it("Нельзя завершить уже завершенное голосование", async function () {
      await votingSystem.endPoll(0);
      
      await expect(
        votingSystem.endPoll(0)
      ).to.be.revertedWith("Poll already ended");
    });
  });

  describe("Получение информации", function () {
    beforeEach(async function () {
      await votingSystem.createPoll("Тестовое голосование", ["Да", "Нет", "Возможно"], 30);
    });

    it("Должен возвращать правильную информацию", async function () {
      const pollInfo = await votingSystem.getPollInfo(0);
      
      expect(pollInfo.title).to.equal("Тестовое голосование");
      expect(pollInfo.options).to.deep.equal(["Да", "Нет", "Возможно"]);
      expect(pollInfo.isActive).to.equal(true);
    });

    it("Должен возвращать опции голосования", async function () {
      const options = await votingSystem.getPollOptions(0);
      expect(options).to.deep.equal(["Да", "Нет", "Возможно"]);
    });

    it("Должен возвращать результаты голосования", async function () {
      await votingSystem.connect(user1).vote(0, 0);
      await votingSystem.connect(user2).vote(0, 1);
      
      const results = await votingSystem.getResults(0);
      
      expect(results.title).to.equal("Тестовое голосование");
      expect(results.options).to.deep.equal(["Да", "Нет", "Возможно"]);
      expect(results.votes[0]).to.equal(1); 
      expect(results.votes[1]).to.equal(1); 
      expect(results.votes[2]).to.equal(0); 
      expect(results.totalVotes).to.equal(2);
    });

    it("Должен проверять, проголосовал ли пользователь", async function () {
      expect(await votingSystem.hasVoted(0, user1.address)).to.equal(false);
      
      await votingSystem.connect(user1).vote(0, 0);
      
      expect(await votingSystem.hasVoted(0, user1.address)).to.equal(true);
      expect(await votingSystem.hasVoted(0, user2.address)).to.equal(false);
    });

    it("Нельзя получить информацию о несуществующем голосовании", async function () {
      await expect(
        votingSystem.getPollInfo(999)
      ).to.be.revertedWith("Poll does not exist");
    });
  });

  describe("Несколько голосований", function () {
    it("Можно создать несколько голосований", async function () {
      await votingSystem.createPoll("Голосование 1", ["Да", "Нет"], 10);
      await votingSystem.createPoll("Голосование 2", ["A", "B", "C"], 20);
      
      expect(await votingSystem.getTotalPolls()).to.equal(2);
      
      const poll1Info = await votingSystem.getPollInfo(0);
      const poll2Info = await votingSystem.getPollInfo(1);
      
      expect(poll1Info.title).to.equal("Голосование 1");
      expect(poll2Info.title).to.equal("Голосование 2");
    });

    it("Голосования независимы друг от друга", async function () {
      await votingSystem.createPoll("Голосование 1", ["Да", "Нет"], 10);
      await votingSystem.createPoll("Голосование 2", ["A", "B"], 10);
      
      await votingSystem.connect(user1).vote(0, 0);
      expect(await votingSystem.hasVoted(0, user1.address)).to.equal(true);
      expect(await votingSystem.hasVoted(1, user1.address)).to.equal(false);

      await votingSystem.connect(user1).vote(1, 1);
      
      expect(await votingSystem.hasVoted(1, user1.address)).to.equal(true);
    });
  });
});