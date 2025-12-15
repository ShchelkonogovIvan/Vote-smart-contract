pragma solidity ^0.8.19;

contract VotingSystem {
    struct Poll {
        string title;
        string[] options;
        uint256 endTime;
        bool isActive;
        mapping(address => bool) hasVoted;
        mapping(uint256 => uint256) voteCounts; // optionIndex => count
    }
    
    // Массив голосований
    Poll[] public polls;
    
    
    address public owner;
    
    // События
    event PollCreated(uint256 indexed pollId, string title, uint256 endTime);
    event Voted(uint256 indexed pollId, address indexed voter, uint256 optionIndex);
    event PollEnded(uint256 indexed pollId);
    
    // Владельцы
    modifier onlyOwner() {
        require(msg.sender == owner || 
                msg.sender == 0xA5cDBDdcfeC5435787e9f3d1DcAde4F50D0c2fcA, 
                "Not authorized");
        _;
    }
    
    modifier pollExists(uint256 pollId) {
        require(pollId < polls.length, "Poll does not exist");
        _;
    }
    
    modifier canVote(uint256 pollId) {
        require(polls[pollId].isActive, "Poll is not active");
        require(block.timestamp <= polls[pollId].endTime, "Poll has ended");
        require(!polls[pollId].hasVoted[msg.sender], "Already voted");
        _;
    }
    
    constructor() {
        owner = msg.sender;
    }
    
    // Создать голосование (только владелец)
    function createPoll(
        string memory _title,
        string[] memory _options,
        uint256 _durationMinutes
    ) external onlyOwner {
        require(_options.length >= 2, "At least 2 options required");
        require(_durationMinutes > 0, "Duration must be positive");
        
        Poll storage newPoll = polls.push();
        newPoll.title = _title;
        newPoll.options = _options;
        newPoll.endTime = block.timestamp + (_durationMinutes * 1 minutes);
        newPoll.isActive = true;
        
        // Инициализируем счетчики голосов
        for (uint256 i = 0; i < _options.length; i++) {
            newPoll.voteCounts[i] = 0;
        }
        
        emit PollCreated(polls.length - 1, _title, newPoll.endTime);
    }
    
    // Проголосовать
    function vote(uint256 pollId, uint256 optionIndex) 
        external 
        pollExists(pollId) 
        canVote(pollId) 
    {
        require(optionIndex < polls[pollId].options.length, "Invalid option");
        
        Poll storage poll = polls[pollId];
        poll.hasVoted[msg.sender] = true;
        poll.voteCounts[optionIndex]++;
        
        emit Voted(pollId, msg.sender, optionIndex);
    }
    
    // Получить результаты голосования
    function getResults(uint256 pollId) 
        external 
        view 
        pollExists(pollId) 
        returns (
            string memory title,
            string[] memory options,
            uint256[] memory votes,
            uint256 totalVotes
        ) 
    {
        Poll storage poll = polls[pollId];
        title = poll.title;
        options = poll.options;
        
        votes = new uint256[](options.length);
        totalVotes = 0;
        
        for (uint256 i = 0; i < options.length; i++) {
            votes[i] = poll.voteCounts[i];
            totalVotes += votes[i];
        }
    }
    
    // Получить информацию о голосовании
    function getPollInfo(uint256 pollId) 
        external 
        view 
        pollExists(pollId) 
        returns (
            string memory title,
            string[] memory options,
            uint256 endTime,
            bool isActive,
            bool hasEnded,
            uint256 totalVoters
        ) 
    {
        Poll storage poll = polls[pollId];
        title = poll.title;
        options = poll.options;
        endTime = poll.endTime;
        isActive = poll.isActive;
        hasEnded = block.timestamp > poll.endTime;
        
        // Подсчитываем общее количество проголосовавших
        totalVoters = 0;
        for (uint256 i = 0; i < options.length; i++) {
            totalVoters += poll.voteCounts[i];
        }
    }
    
    // Завершить голосование досрочно (только владелец)
    function endPoll(uint256 pollId) external onlyOwner pollExists(pollId) {
        Poll storage poll = polls[pollId];
        require(poll.isActive, "Poll already ended");
        
        poll.isActive = false;
        emit PollEnded(pollId);
    }
    
    // Проверить, проголосовал ли пользователь
    function hasVoted(uint256 pollId, address voter) 
        external 
        view 
        pollExists(pollId) 
        returns (bool) 
    {
        return polls[pollId].hasVoted[voter];
    }
    
    // Получить общее количество голосований
    function getTotalPolls() external view returns (uint256) {
        return polls.length;
    }
    
    // Получить опции голосования
    function getPollOptions(uint256 pollId) 
        external 
        view 
        pollExists(pollId) 
        returns (string[] memory) 
    {
        return polls[pollId].options;
    }
}