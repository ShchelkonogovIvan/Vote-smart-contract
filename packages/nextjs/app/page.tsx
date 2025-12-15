'use client';

import { useState, useEffect } from 'react';
import { 
  useAccount, 
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
  usePublicClient
} from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import deployedContracts from '../contracts/deployedContracts.ts';

export default function Home() {
  const { address, isConnected, chainId } = useAccount();
  const publicClient = usePublicClient();
  const [activeTab, setActiveTab] = useState<'create' | 'vote' | 'results'>('create');
  
  // Состояния для создания голосования
  const [pollTitle, setPollTitle] = useState('Тестовое голосование');
  const [pollOptions, setPollOptions] = useState('Да, Нет');
  const [pollDuration, setPollDuration] = useState('60');
  const [selectedPoll, setSelectedPoll] = useState<number | null>(null);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [transactionStatus, setTransactionStatus] = useState<string>('');
  
  // Состояние для информации о голосованиях
  const [pollsData, setPollsData] = useState<any[]>([]);
  const [isLoadingPolls, setIsLoadingPolls] = useState(false);
  const [selectedPollResults, setSelectedPollResults] = useState<any>(null);
  
  // Получаем контракт
  const contractConfig = deployedContracts[31337]?.VotingSystem;
  const contractAddress = contractConfig?.address as `0x${string}` | undefined;
  const contractABI = contractConfig?.abi || [];

  // 1. Чтение: общее количество голосований
  const { 
    data: totalPolls, 
    refetch: refetchTotalPolls,
    isLoading: isLoadingTotalPolls,
  } = useReadContract({
    address: contractAddress,
    abi: contractABI,
    functionName: 'getTotalPolls',
    query: {
      enabled: isConnected && !!contractAddress,
    }
  });

  // Запись: создание голосования
  const { 
    writeContractAsync: createPollWrite,
    isPending: isCreatingPoll,
    data: createPollHash,
    error: createPollError,
    reset: resetCreatePoll
  } = useWriteContract();

  // Запись: голосование
  const { 
    writeContractAsync: voteWrite,
    isPending: isVoting,
    data: voteHash,
    error: voteError,
    reset: resetVote
  } = useWriteContract();

  // Запись: завершение голосования
  const { 
    writeContractAsync: endPollWrite,
    isPending: isEndingPoll,
    data: endPollHash,
    error: endPollError,
    reset: resetEndPoll
  } = useWriteContract();

  // Ожидание подтверждения транзакций
  const { 
    isLoading: isConfirmingCreate, 
    isSuccess: isCreateSuccess,
  } = useWaitForTransactionReceipt({
    hash: createPollHash,
  });

  const { 
    isLoading: isConfirmingVote, 
    isSuccess: isVoteSuccess,
  } = useWaitForTransactionReceipt({
    hash: voteHash,
  });

  const { 
    isLoading: isConfirmingEnd, 
    isSuccess: isEndSuccess,
  } = useWaitForTransactionReceipt({
    hash: endPollHash,
  });

  // Загрузка информации о голосованиях
  useEffect(() => {
    async function loadPollsData() {
      if (!isConnected || !contractAddress || !totalPolls) return;
      
      const total = Number(totalPolls);
      if (total === 0) {
        setPollsData([]);
        return;
      }
      
      setIsLoadingPolls(true);
      const polls = [];
      
      try {
        for (let i = 0; i < total; i++) {
          try {
            // Получаем информацию о голосовании
            const pollInfo = await publicClient.readContract({
              address: contractAddress,
              abi: contractABI,
              functionName: 'getPollInfo',
              args: [BigInt(i)]
            });
            
            // Получаем варианты ответов
            const options = await publicClient.readContract({
              address: contractAddress,
              abi: contractABI,
              functionName: 'getPollOptions',
              args: [BigInt(i)]
            });
            
            // Получаем результаты голосования
            let results = null;
            try {
              results = await publicClient.readContract({
                address: contractAddress,
                abi: contractABI,
                functionName: 'getResults',
                args: [BigInt(i)]
              });
            } catch (resultsError) {
              console.log(`Результаты для голосования #${i} не загружены:`, resultsError);
            }
            
            // Проверяем, проголосовал ли пользователь
            let hasVoted = false;
            if (address) {
              hasVoted = await publicClient.readContract({
                address: contractAddress,
                abi: contractABI,
                functionName: 'hasVoted',
                args: [BigInt(i), address]
              });
            }
            
            const currentTime = Math.floor(Date.now() / 1000);
            const endTime = Number(pollInfo[2]);
            const isActiveManual = pollInfo[3]; // Установлено владельцем
            const totalVoters = Number(pollInfo[5]) || 0;
            const hasEndedByTime = endTime < currentTime; // Проверяем по времени
            
            // Истинный статус: активно если владелец не завершил И время не истекло
            const isActuallyActive = isActiveManual && !hasEndedByTime;
            
            polls.push({
              id: i,
              title: pollInfo[0] || `Голосование #${i + 1}`,
              options: options || [],
              endTime: endTime,
              isActiveManual: isActiveManual,
              hasEndedByTime: hasEndedByTime,
              isActive: isActuallyActive,
              totalVoters: totalVoters,
              hasVoted: hasVoted,
              timeRemaining: endTime > currentTime ? endTime - currentTime : 0,
              results: results ? {
                title: results[0],
                options: results[1],
                votes: results[2] ? results[2].map((v: bigint) => Number(v)) : [],
                totalVotes: results[3] ? Number(results[3]) : 0
              } : null
            });
            
          } catch (error) {
            console.error(`Ошибка загрузки голосования #${i}:`, error);
            polls.push({
              id: i,
              title: `Голосование #${i + 1}`,
              options: [],
              endTime: 0,
              isActive: false,
              totalVoters: 0,
              hasVoted: false,
              timeRemaining: 0
            });
          }
        }
        
        setPollsData(polls);
      } catch (error) {
        console.error('Общая ошибка загрузки голосований:', error);
      } finally {
        setIsLoadingPolls(false);
      }
    }
    
    loadPollsData();
  }, [isConnected, contractAddress, totalPolls, address, publicClient, contractABI, isCreateSuccess, isVoteSuccess, isEndSuccess]);

  // Загрузка результатов выбранного голосования
  useEffect(() => {
    async function loadSelectedPollResults() {
      if (selectedPoll === null || !contractAddress) return;
      
      try {
        const results = await publicClient.readContract({
          address: contractAddress,
          abi: contractABI,
          functionName: 'getResults',
          args: [BigInt(selectedPoll)]
        });
        
        setSelectedPollResults({
          title: results[0],
          options: results[1],
          votes: results[2].map((v: bigint) => Number(v)),
          totalVotes: Number(results[3])
        });
      } catch (error) {
        console.error('Ошибка загрузки результатов:', error);
        setSelectedPollResults(null);
      }
    }
    
    loadSelectedPollResults();
  }, [selectedPoll, contractAddress, publicClient, contractABI, isVoteSuccess, isEndSuccess]);

  // Функция создания голосования
  const handleCreatePoll = async () => {
    console.log('🔄 handleCreatePoll вызван');
    
    if (!pollTitle.trim()) {
      alert('Введите название голосования');
      return;
    }
    
    const optionsArray = pollOptions.split(',')
      .map(opt => opt.trim())
      .filter(opt => opt.length > 0);
    
    if (optionsArray.length < 2) {
      alert('Нужно как минимум 2 варианта ответа');
      return;
    }
    
    const duration = parseInt(pollDuration);
    if (isNaN(duration) || duration <= 0) {
      alert('Введите корректную длительность');
      return;
    }
    
    if (!contractAddress) {
      alert('Адрес контракта не найден');
      return;
    }
    
    if (!address) {
      alert('Подключите кошелек');
      return;
    }
    
    console.log('📤 Параметры:', { title: pollTitle, options: optionsArray, duration });
    
    try {
      setTransactionStatus('Отправляем транзакцию...');
      
      const hash = await createPollWrite({
        address: contractAddress,
        abi: contractABI,
        functionName: 'createPoll',
        args: [pollTitle, optionsArray, BigInt(duration)],
      });
      
      console.log('✅ Транзакция отправлена! Хэш:', hash);
      setTransactionStatus(`✅ Транзакция отправлена!`);
      
    } catch (error: any) {
      console.error('❌ Ошибка создания голосования:', error);
      
      let errorMessage = 'Неизвестная ошибка';
      
      if (error.message?.includes('user rejected')) {
        errorMessage = 'Вы отклонили транзакцию';
      } else if (error.message?.includes('Not contract owner')) {
        errorMessage = 'Только владелец контракта может создавать голосования';
      } else if (error.message?.includes('At least 2 options required')) {
        errorMessage = 'Нужно минимум 2 варианта ответа';
      } else if (error.message?.includes('Duration must be positive')) {
        errorMessage = 'Длительность должна быть положительной';
      } else {
        errorMessage = error.message || error.toString();
      }
      
      setTransactionStatus(`❌ ${errorMessage}`);
      alert(`❌ ${errorMessage}`);
    }
  };

  // Функция голосования
  const handleVote = async () => {
    if (selectedPoll === null || selectedOption === null || !contractAddress || !address) {
      alert('Выберите голосование и вариант ответа');
      return;
    }
    
    try {
      setTransactionStatus('Отправка голоса...');
      
      const hash = await voteWrite({
        address: contractAddress,
        abi: contractABI,
        functionName: 'vote',
        args: [BigInt(selectedPoll), BigInt(selectedOption)],
      });
      
      console.log('Голос отправлен! Хэш:', hash);
      setTransactionStatus(`✅ Голос отправлен!`);
      
    } catch (error: any) {
      console.error('❌ Ошибка голосования:', error);
      setTransactionStatus(`❌ Ошибка голосования`);
      
      if (error.message?.includes('Already voted')) {
        alert('❌ Вы уже голосовали в этом голосовании!');
      } else if (error.message?.includes('Poll has ended')) {
        alert('❌ Голосование уже завершено!');
      } else if (error.message?.includes('Poll is not active')) {
        alert('❌ Голосование не активно!');
      } else if (error.message?.includes('user rejected')) {
        alert('❌ Вы отклонили транзакцию');
      } else {
        alert(`❌ Ошибка: ${error.message || 'Неизвестная ошибка'}`);
      }
    }
  };

  // Функция завершения голосования
  const handleEndPoll = async (pollId: number) => {
    if (!contractAddress || !address) {
      alert('Подключите кошелек');
      return;
    }
    
    try {
      setTransactionStatus('Завершение голосования...');
      
      const hash = await endPollWrite({
        address: contractAddress,
        abi: contractABI,
        functionName: 'endPoll',
        args: [BigInt(pollId)],
      });
      
      console.log('Голосование завершено! Хэш:', hash);
      setTransactionStatus(`✅ Голосование завершено!`);
      
    } catch (error: any) {
      console.error('❌ Ошибка завершения голосования:', error);
      setTransactionStatus(`❌ Ошибка завершения голосования`);
      
      if (error.message?.includes('Not contract owner')) {
        alert('❌ Только владелец контракта может завершать голосования');
      } else if (error.message?.includes('user rejected')) {
        alert('❌ Вы отклонили транзакцию');
      } else {
        alert(`❌ Ошибка: ${error.message || 'Неизвестная ошибка'}`);
      }
    }
  };

  // Обработка успешных транзакций
  useEffect(() => {
    if (isCreateSuccess && createPollHash) {
      console.log('🎉 Голосование создано!');
      setTransactionStatus(`🎉 Голосование создано!`);
      
      setTimeout(async () => {
        try {
          await refetchTotalPolls();
          setPollTitle('');
          setPollOptions('');
          setPollDuration('60');
          resetCreatePoll();
          setActiveTab('vote');
          alert('✅ Голосование успешно создано!');
        } catch (error) {
          console.error('Ошибка обновления:', error);
        } finally {
          setTransactionStatus('');
        }
      }, 2000);
    }
  }, [isCreateSuccess, createPollHash, refetchTotalPolls, resetCreatePoll]);

  useEffect(() => {
    if (isVoteSuccess && voteHash) {
      console.log('🎉 Голосование подтверждено!');
      setTransactionStatus(`🎉 Ваш голос засчитан!`);
      
      setTimeout(async () => {
        resetVote();
        setSelectedOption(null);
        setTransactionStatus('');
        alert('✅ Ваш голос успешно засчитан!');
        
        await refetchTotalPolls();
      }, 2000);
    }
  }, [isVoteSuccess, voteHash, resetVote, refetchTotalPolls]);

  useEffect(() => {
    if (isEndSuccess && endPollHash) {
      console.log('🎉 Голосование завершено!');
      setTransactionStatus(`🎉 Голосование завершено!`);
      
      setTimeout(async () => {
        resetEndPoll();
        setTransactionStatus('');
        alert('✅ Голосование успешно завершено!');
        
        await refetchTotalPolls();
      }, 2000);
    }
  }, [isEndSuccess, endPollHash, resetEndPoll, refetchTotalPolls]);

  // Вспомогательные функции
  const handleRefreshData = async () => {
    try {
      setIsLoadingPolls(true);
      await refetchTotalPolls();
      alert('✅ Данные обновлены!');
    } catch (error) {
      alert('❌ Не удалось обновить данные');
    } finally {
      setIsLoadingPolls(false);
    }
  };

  // Форматирование времени
  const formatTimeRemaining = (seconds: number) => {
    if (seconds <= 0) return 'Завершено';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}ч ${minutes}м`;
    }
    return `${minutes} минут`;
  };

  const getStatusColor = (poll: any) => {
    if (!poll.isActive) return '#ef4444'; // Красный - завершено
    if (poll.hasEndedByTime) return '#f59e0b'; // Желтый - время истекло, но владелец не завершил
    return '#10b981'; // Зеленый - активно
  };

  const getStatusText = (poll: any) => {
    if (!poll.isActive) return 'Завершено';
    if (poll.hasEndedByTime) return 'Время истекло';
    return 'Активно';
  };

  const totalPollsNumber = totalPolls ? Number(totalPolls) : 0;

  const getTabStyle = (tabName: 'create' | 'vote' | 'results') => {
    const isActive = activeTab === tabName;
    return {
      padding: '0.5rem 1rem',
      fontWeight: '500' as const,
      color: isActive ? '#60a5fa' : '#94a3b8',
      backgroundColor: 'transparent',
      border: 'none',
      cursor: 'pointer' as const,
      borderBottom: isActive ? '2px solid #60a5fa' : '2px solid transparent',
    };
  };

  return (
    <div style={{ 
      minHeight: '100vh', 
      backgroundColor: '#0f172a',
      color: '#f1f5f9',
      padding: '1rem',
      fontFamily: 'Arial, sans-serif'
    }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        
        {/* Шапка */}
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          marginBottom: '2rem',
          gap: '1rem'
        }}>
          <div>
            <h1 style={{ 
              fontSize: '2rem', 
              fontWeight: 'bold', 
              color: '#ffffff',
              marginBottom: '0.5rem'
            }}>
               Smart Voting System
            </h1>
            <p style={{ color: '#94a3b8' }}>
              Создавайте голосования, участвуйте в них и смотрите результаты
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ 
              backgroundColor: '#1e293b', 
              borderRadius: '0.5rem', 
              padding: '0.75rem',
            }}>
              <div style={{ fontSize: '0.875rem', color: '#94a3b8' }}>Всего голосований</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#60a5fa' }}>
                {isLoadingTotalPolls ? '...' : totalPollsNumber}
              </div>
            </div>
            <ConnectButton />
          </div>
        </div>

        {/* Статус */}
        {transactionStatus && (
          <div style={{ 
            backgroundColor: transactionStatus.includes('✅') || transactionStatus.includes('🎉') 
              ? '#065f4620' 
              : '#7f1d1d20',
            borderRadius: '0.5rem',
            padding: '1rem',
            marginBottom: '1rem',
            color: transactionStatus.includes('✅') || transactionStatus.includes('🎉') 
              ? '#10b981' 
              : '#ef4444'
          }}>
            {transactionStatus}
          </div>
        )}

        {/* Основной контент */}
        <div style={{ 
          backgroundColor: '#1e293b',
          borderRadius: '1rem',
          padding: '1.5rem'
        }}>
          
          {/* Табы */}
          <div style={{ 
            display: 'flex', 
            borderBottom: '1px solid #334155',
            marginBottom: '1.5rem'
          }}>
            <button
              style={getTabStyle('create')}
              onClick={() => setActiveTab('create')}
            >
              Создать голосование
            </button>
            <button
              style={getTabStyle('vote')}
              onClick={() => setActiveTab('vote')}
            >
              Проголосовать ({totalPollsNumber})
            </button>
            <button
              style={getTabStyle('results')}
              onClick={() => setActiveTab('results')}
            >
              Результаты
            </button>
          </div>

          {/* Контент табов */}
          {!isConnected ? (
            <div style={{ textAlign: 'center', padding: '3rem 0' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔒</div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: '600', color: '#ffffff', marginBottom: '0.5rem' }}>
                Подключите кошелек
              </h3>
              <p style={{ color: '#94a3b8', marginBottom: '1.5rem' }}>
                Для использования системы необходимо подключить кошелек
              </p>
              <ConnectButton />
            </div>
          ) : chainId !== 31337 ? (
            <div style={{ textAlign: 'center', padding: '3rem 0' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem', color: '#fbbf24' }}>⚠️</div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: '600', color: '#ffffff', marginBottom: '0.5rem' }}>
                Неправильная сеть
              </h3>
              <p style={{ color: '#94a3b8' }}>
                Пожалуйста, переключитесь на сеть Hardhat Local (Chain ID: 31337)
              </p>
            </div>
          ) : (
            <>
              {/* ТАБ: СОЗДАНИЕ ГОЛОСОВАНИЯ */}
              {activeTab === 'create' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: '600', color: '#ffffff' }}>
                    Создать новое голосование
                  </h3>
                  
                  <div>
                    <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#e2e8f0', marginBottom: '0.25rem' }}>
                      Название голосования *
                    </label>
                    <input
                      type="text"
                      value={pollTitle}
                      onChange={(e) => setPollTitle(e.target.value)}
                      placeholder="Например: Выбор даты следующей встречи"
                      style={{ 
                        width: '100%',
                        padding: '0.75rem 1rem',
                        backgroundColor: '#0f172a',
                        border: '1px solid #334155',
                        borderRadius: '0.5rem',
                        color: '#f1f5f9',
                        marginTop: '0.25rem'
                      }}
                    />
                  </div>
                  
                  <div>
                    <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#e2e8f0', marginBottom: '0.25rem' }}>
                      Варианты ответа (через запятую) *
                    </label>
                    <input
                      type="text"
                      value={pollOptions}
                      onChange={(e) => setPollOptions(e.target.value)}
                      placeholder="Да, Нет"
                      style={{ 
                        width: '100%',
                        padding: '0.75rem 1rem',
                        backgroundColor: '#0f172a',
                        border: '1px solid #334155',
                        borderRadius: '0.5rem',
                        color: '#f1f5f9',
                        marginTop: '0.25rem'
                      }}
                    />
                    <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.25rem' }}>
                      Минимум 2 варианта
                    </p>
                  </div>
                  
                  <div>
                    <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#e2e8f0', marginBottom: '0.25rem' }}>
                      Длительность голосования (минут) *
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="10080"
                      value={pollDuration}
                      onChange={(e) => setPollDuration(e.target.value)}
                      style={{ 
                        width: '8rem',
                        padding: '0.75rem 1rem',
                        backgroundColor: '#0f172a',
                        border: '1px solid #334155',
                        borderRadius: '0.5rem',
                        color: '#f1f5f9',
                        marginTop: '0.25rem'
                      }}
                    />
                  </div>
                  
                  <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <button
                      onClick={handleCreatePoll}
                      disabled={isCreatingPoll || isConfirmingCreate}
                      style={{
                        padding: '0.75rem 1.5rem',
                        backgroundColor: isCreatingPoll || isConfirmingCreate ? '#475569' : '#3b82f6',
                        color: 'white',
                        borderRadius: '0.5rem',
                        border: 'none',
                        cursor: isCreatingPoll || isConfirmingCreate ? 'not-allowed' : 'pointer',
                        minWidth: '180px'
                      }}
                    >
                      {isCreatingPoll ? 'Подписание...' : 
                       isConfirmingCreate ? 'Подтверждение...' : 
                       isCreateSuccess ? '✅ Создано!' : 
                       'Создать голосование'}
                    </button>
                    
                    <button
                      onClick={handleRefreshData}
                      style={{
                        padding: '0.5rem 1rem',
                        backgroundColor: '#6b7280',
                        color: 'white',
                        border: 'none',
                        borderRadius: '0.5rem',
                        cursor: 'pointer'
                      }}
                    >
                      🔄 Обновить
                    </button>
                  </div>
                  
                  {createPollError && (
                    <div style={{ color: '#ef4444', padding: '0.5rem', backgroundColor: '#7f1d1d20', borderRadius: '0.25rem' }}>
                      ❌ Ошибка: {createPollError.message}
                    </div>
                  )}
                </div>
              )}

              {/* ТАБ: ГОЛОСОВАНИЕ */}
              {activeTab === 'vote' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: '600', color: '#ffffff' }}>
                      Выберите голосование
                    </h3>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        onClick={handleRefreshData}
                        disabled={isLoadingPolls}
                        style={{
                          padding: '0.5rem 1rem',
                          backgroundColor: isLoadingPolls ? '#475569' : '#3b82f6',
                          color: 'white',
                          border: 'none',
                          borderRadius: '0.5rem',
                          cursor: isLoadingPolls ? 'not-allowed' : 'pointer'
                        }}
                      >
                        {isLoadingPolls ? 'Загрузка...' : '🔄 Обновить список'}
                      </button>
                    </div>
                  </div>
                  
                  {isLoadingPolls ? (
                    <div style={{ textAlign: 'center', padding: '3rem 0' }}>
                      <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⏳</div>
                      <p style={{ color: '#94a3b8' }}>Загрузка голосований...</p>
                    </div>
                  ) : totalPollsNumber === 0 ? (
                    <div style={{ textAlign: 'center', padding: '3rem 0' }}>
                      <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📭</div>
                      <h4 style={{ fontSize: '1.125rem', fontWeight: '600', color: '#ffffff', marginBottom: '0.5rem' }}>
                        Голосований пока нет
                      </h4>
                      <p style={{ color: '#94a3b8', marginBottom: '1.5rem' }}>
                        Создайте первое голосование на вкладке "Создать голосование"
                      </p>
                      <button
                        onClick={() => setActiveTab('create')}
                        style={{
                          padding: '0.75rem 1.5rem',
                          backgroundColor: '#3b82f6',
                          color: 'white',
                          border: 'none',
                          borderRadius: '0.5rem',
                          cursor: 'pointer',
                          fontWeight: '500'
                        }}
                      >
                        Создать голосование
                      </button>
                    </div>
                  ) : (
                    <>
                      {/* Список голосований */}
                      <div style={{ 
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                        gap: '1rem'
                      }}>
                        {pollsData.map((poll) => (
                          <div
                            key={poll.id}
                            style={{
                              border: '1px solid #334155',
                              backgroundColor: '#0f172a',
                              borderRadius: '0.5rem',
                              padding: '1rem',
                              cursor: poll.isActive ? 'pointer' : 'default',
                              transition: 'all 0.2s',
                              opacity: poll.isActive ? 1 : 0.8,
                              ...(selectedPoll === poll.id && {
                                borderColor: '#3b82f6',
                                backgroundColor: '#1e40af20'
                              })
                            }}
                            onClick={() => {
                              if (poll.isActive) {
                                setSelectedPoll(poll.id);
                                setSelectedOption(null);
                              }
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                              <div style={{ flex: 1 }}>
                                <h4 style={{ 
                                  fontWeight: '600', 
                                  color: '#f1f5f9', 
                                  marginBottom: '0.5rem',
                                  fontSize: '1.1rem',
                                  wordBreak: 'break-word'
                                }}>
                                  {poll.title}
                                </h4>
                                <div style={{ 
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  fontSize: '0.75rem',
                                  padding: '0.25rem 0.5rem',
                                  borderRadius: '0.25rem',
                                  backgroundColor: `${getStatusColor(poll)}20`,
                                  color: getStatusColor(poll),
                                  marginBottom: '0.5rem'
                                }}>
                                  {getStatusText(poll)}
                                </div>
                              </div>
                              {selectedPoll === poll.id && (
                                <div style={{ color: '#3b82f6', fontSize: '1.25rem', marginLeft: '0.5rem' }}>✓</div>
                              )}
                            </div>
                            
                            <div style={{ marginTop: '0.5rem' }}>
                              <div style={{ fontSize: '0.875rem', color: '#94a3b8' }}>
                                {poll.isActive ? (
                                  <>Осталось: {formatTimeRemaining(poll.timeRemaining)}</>
                                ) : (
                                  <>Завершено</>
                                )}
                              </div>
                              <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
                                Вариантов: {poll.options?.length || 0} • Проголосовало: {poll.totalVoters}
                                {poll.hasVoted && ' • ✓ Вы проголосовали'}
                              </div>
                              {poll.endTime > 0 && (
                                <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '0.25rem' }}>
                                  До: {new Date(poll.endTime * 1000).toLocaleString()}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                      
                      {/* Панель выбранного голосования */}
                      {selectedPoll !== null && pollsData[selectedPoll] && (
                        <div style={{ 
                          marginTop: '2rem',
                          border: '1px solid #334155',
                          backgroundColor: '#0f172a',
                          borderRadius: '0.5rem',
                          padding: '1.5rem'
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <h3 style={{ fontSize: '1.25rem', fontWeight: '600', color: '#ffffff', marginBottom: '0.5rem' }}>
                              🗳️ {pollsData[selectedPoll].title}
                            </h3>
                            <div style={{ 
                              display: 'inline-flex',
                              alignItems: 'center',
                              fontSize: '0.75rem',
                              padding: '0.25rem 0.75rem',
                              borderRadius: '0.25rem',
                              backgroundColor: `${getStatusColor(pollsData[selectedPoll])}20`,
                              color: getStatusColor(pollsData[selectedPoll]),
                              marginBottom: '0.5rem'
                            }}>
                              {getStatusText(pollsData[selectedPoll])}
                            </div>
                          </div>
                          
                          {pollsData[selectedPoll].hasVoted ? (
                            <div style={{ 
                              padding: '1rem',
                              backgroundColor: '#065f4620',
                              borderRadius: '0.5rem',
                              marginBottom: '1rem'
                            }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#10b981' }}>
                                <span>✓</span>
                                <span>Вы уже проголосовали в этом голосовании</span>
                              </div>
                            </div>
                          ) : !pollsData[selectedPoll].isActive ? (
                            <div style={{ 
                              padding: '1rem',
                              backgroundColor: '#7f1d1d20',
                              borderRadius: '0.5rem',
                              marginBottom: '1rem'
                            }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#ef4444' }}>
                                <span>⏰</span>
                                <span>Голосование завершено</span>
                              </div>
                            </div>
                          ) : (
                            <>
                              <h4 style={{ fontSize: '1rem', fontWeight: '500', color: '#e2e8f0', marginBottom: '1rem' }}>
                                Выберите вариант ответа:
                              </h4>
                              
                              {pollsData[selectedPoll].options?.length > 0 ? (
                                <>
                                  <div style={{ 
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                                    gap: '0.75rem',
                                    marginBottom: '1.5rem'
                                  }}>
                                    {pollsData[selectedPoll].options.map((option: string, index: number) => (
                                      <button
                                        key={index}
                                        onClick={() => setSelectedOption(index)}
                                        style={{
                                          padding: '1rem',
                                          backgroundColor: selectedOption === index ? '#3b82f6' : '#1e293b',
                                          color: 'white',
                                          border: selectedOption === index ? '2px solid #60a5fa' : '1px solid #334155',
                                          borderRadius: '0.5rem',
                                          cursor: 'pointer',
                                          textAlign: 'left',
                                          transition: 'all 0.2s',
                                          fontSize: '0.95rem'
                                        }}
                                      >
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                          <span>{option}</span>
                                          {selectedOption === index && (
                                            <span style={{ fontSize: '1.25rem' }}>✓</span>
                                          )}
                                        </div>
                                      </button>
                                    ))}
                                  </div>
                                  
                                  <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                    <button
                                      onClick={handleVote}
                                      disabled={selectedOption === null || isVoting || isConfirmingVote || !pollsData[selectedPoll].isActive}
                                      style={{
                                        padding: '0.75rem 1.5rem',
                                        backgroundColor: selectedOption === null || isVoting || isConfirmingVote || !pollsData[selectedPoll].isActive
                                          ? '#475569' 
                                          : '#10b981',
                                        color: 'white',
                                        borderRadius: '0.5rem',
                                        border: 'none',
                                        cursor: selectedOption === null || isVoting || isConfirmingVote || !pollsData[selectedPoll].isActive
                                          ? 'not-allowed' 
                                          : 'pointer',
                                        minWidth: '180px'
                                      }}
                                    >
                                      {isVoting ? 'Подписание...' : 
                                       isConfirmingVote ? 'Подтверждение...' : 
                                       'Проголосовать'}
                                    </button>
                                    
                                    <button
                                      onClick={() => setSelectedOption(null)}
                                      style={{
                                        padding: '0.5rem 1rem',
                                        backgroundColor: 'transparent',
                                        color: '#94a3b8',
                                        border: '1px solid #334155',
                                        borderRadius: '0.5rem',
                                        cursor: 'pointer'
                                      }}
                                    >
                                      Сбросить выбор
                                    </button>
                                    
                                    {/* Кнопка завершения голосования (только для владельца) */}
                                    <button
                                      onClick={() => handleEndPoll(selectedPoll)}
                                      disabled={isEndingPoll || isConfirmingEnd || !pollsData[selectedPoll].isActive}
                                      style={{
                                        padding: '0.5rem 1rem',
                                        backgroundColor: isEndingPoll || isConfirmingEnd || !pollsData[selectedPoll].isActive
                                          ? '#475569' 
                                          : '#ef4444',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '0.5rem',
                                        cursor: isEndingPoll || isConfirmingEnd || !pollsData[selectedPoll].isActive
                                          ? 'not-allowed' 
                                          : 'pointer'
                                      }}
                                    >
                                      {isEndingPoll ? 'Завершение...' : 
                                       isConfirmingEnd ? 'Подтверждение...' : 
                                       'Завершить голосование'}
                                    </button>
                                  </div>
                                </>
                              ) : (
                                <div style={{ color: '#ef4444', padding: '1rem', backgroundColor: '#7f1d1d20', borderRadius: '0.5rem' }}>
                                  Нет доступных вариантов для голосования
                                </div>
                              )}
                            </>
                          )}
                          
                          {/* Результаты голосования */}
                          {selectedPollResults && (
                            <div style={{ 
                              marginTop: '1.5rem',
                              padding: '1rem',
                              backgroundColor: '#1e293b',
                              borderRadius: '0.5rem',
                              border: '1px solid #334155'
                            }}>
                              <h4 style={{ fontSize: '0.875rem', fontWeight: '600', color: '#94a3b8', marginBottom: '0.5rem' }}>
                                Результаты голосования
                              </h4>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                {selectedPollResults.options.map((option: string, index: number) => {
                                  const votes = selectedPollResults.votes[index];
                                  const percentage = selectedPollResults.totalVotes > 0 
                                    ? (votes / selectedPollResults.totalVotes * 100).toFixed(1)
                                    : 0;
                                  
                                  return (
                                    <div key={index}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                                        <span style={{ fontSize: '0.875rem', color: '#e2e8f0' }}>{option}</span>
                                        <span style={{ fontSize: '0.875rem', color: '#94a3b8' }}>
                                          {votes} голосов ({percentage}%)
                                        </span>
                                      </div>
                                      <div style={{ 
                                        height: '6px',
                                        backgroundColor: '#334155',
                                        borderRadius: '3px',
                                        overflow: 'hidden'
                                      }}>
                                        <div 
                                          style={{ 
                                            height: '100%',
                                            backgroundColor: '#3b82f6',
                                            width: `${percentage}%`,
                                            transition: 'width 0.3s'
                                          }}
                                        />
                                      </div>
                                    </div>
                                  );
                                })}
                                <div style={{ fontSize: '0.875rem', color: '#94a3b8', marginTop: '0.5rem' }}>
                                  Всего голосов: {selectedPollResults.totalVotes}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* ТАБ: РЕЗУЛЬТАТЫ */}
              {activeTab === 'results' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: '600', color: '#ffffff' }}>
                      Результаты всех голосований
                    </h3>
                    <button
                      onClick={handleRefreshData}
                      disabled={isLoadingPolls}
                      style={{
                        padding: '0.5rem 1rem',
                        backgroundColor: isLoadingPolls ? '#475569' : '#3b82f6',
                        color: 'white',
                        border: 'none',
                        borderRadius: '0.5rem',
                        cursor: isLoadingPolls ? 'not-allowed' : 'pointer'
                      }}
                    >
                      {isLoadingPolls ? 'Загрузка...' : '🔄 Обновить'}
                    </button>
                  </div>
                  
                  {isLoadingPolls ? (
                    <div style={{ textAlign: 'center', padding: '3rem 0' }}>
                      <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⏳</div>
                      <p style={{ color: '#94a3b8' }}>Загрузка результатов...</p>
                    </div>
                  ) : totalPollsNumber === 0 ? (
                    <div style={{ textAlign: 'center', padding: '3rem 0' }}>
                      <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📭</div>
                      <h4 style={{ fontSize: '1.125rem', fontWeight: '600', color: '#ffffff', marginBottom: '0.5rem' }}>
                        Нет данных для отображения
                      </h4>
                      <p style={{ color: '#94a3b8', marginBottom: '1.5rem' }}>
                        Создайте голосования и проголосуйте, чтобы увидеть результаты
                      </p>
                    </div>
                  ) : (
                    <div style={{ 
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
                      gap: '1.5rem'
                    }}>
                      {pollsData.map((poll) => (
                        <div
                          key={poll.id}
                          style={{
                            border: '1px solid #334155',
                            backgroundColor: '#0f172a',
                            borderRadius: '0.5rem',
                            padding: '1.5rem'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <h4 style={{ 
                              fontWeight: '600', 
                              color: '#f1f5f9', 
                              marginBottom: '0.5rem',
                              fontSize: '1.1rem'
                            }}>
                              {poll.title}
                            </h4>
                            <div style={{ 
                              display: 'inline-flex',
                              alignItems: 'center',
                              fontSize: '0.75rem',
                              padding: '0.25rem 0.5rem',
                              borderRadius: '0.25rem',
                              backgroundColor: `${getStatusColor(poll)}20`,
                              color: getStatusColor(poll)
                            }}>
                              {getStatusText(poll)}
                            </div>
                          </div>
                          
                          <div style={{ fontSize: '0.875rem', color: '#94a3b8', marginBottom: '1rem' }}>
                            Всего голосов: {poll.totalVoters || 0}
                            {poll.hasVoted && ' • ✓ Вы участвовали'}
                          </div>
                          
                          {poll.results && poll.results.totalVotes > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                              {poll.results.options.map((option: string, index: number) => {
                                const votes = poll.results.votes[index];
                                const percentage = poll.results.totalVotes > 0 
                                  ? (votes / poll.results.totalVotes * 100).toFixed(1)
                                  : 0;
                                
                                return (
                                  <div key={index}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                                      <span style={{ fontSize: '0.875rem', color: '#e2e8f0' }}>{option}</span>
                                      <span style={{ fontSize: '0.875rem', color: '#94a3b8' }}>
                                        {votes} голосов ({percentage}%)
                                      </span>
                                    </div>
                                    <div style={{ 
                                      height: '6px',
                                      backgroundColor: '#334155',
                                      borderRadius: '3px',
                                      overflow: 'hidden'
                                    }}>
                                      <div 
                                        style={{ 
                                          height: '100%',
                                          backgroundColor: '#3b82f6',
                                          width: `${percentage}%`,
                                          transition: 'width 0.3s'
                                        }}
                                      />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div style={{ 
                              padding: '1rem',
                              backgroundColor: '#1e293b',
                              borderRadius: '0.5rem',
                              textAlign: 'center',
                              color: '#94a3b8'
                            }}>
                              Нет данных о результатах голосования
                            </div>
                          )}
                          
                          <div style={{ 
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            alignItems: 'center',
                            marginTop: '1rem',
                            paddingTop: '1rem',
                            borderTop: '1px solid #334155',
                            fontSize: '0.75rem',
                            color: '#64748b'
                          }}>
                            <span>ID: #{poll.id + 1}</span>
                            <span>
                              {poll.endTime > 0 ? 
                                new Date(poll.endTime * 1000).toLocaleDateString() : 
                                'Дата неизвестна'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}