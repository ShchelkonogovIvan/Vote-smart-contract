import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  // Деплоим контракт
  const votingSystem = await deploy("VotingSystem", {
    from: deployer,
    args: [], 
    log: true,
    autoMine: true,
    waitConfirmations: 1,
  });

  console.log("Контракт задеплоен");
  console.log(`Адрес контракта: ${votingSystem.address}`);

  // Добавляем тестовое голосование
  if (votingSystem.newlyDeployed) {
    try {
      const contract = await hre.ethers.getContractAt("VotingSystem", votingSystem.address);

      const tx1 = await contract.createPoll(
        "test",
        ["1", "2", "3"],
        60 
      );
      await tx1.wait();
      
    } catch (error) {
      console.warn("Не удалось добавить тестовые данные:", error.message);
    }
  }
};

export default func;
func.tags = ["VotingSystem"];
func.description = "Деплой контракта";