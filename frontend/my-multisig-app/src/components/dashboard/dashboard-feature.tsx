'use client'

import { AppHero } from '@/components/app-hero'
import { WalletButton } from '@/components/solana/solana-provider'
import { useWallet } from '@solana/wallet-adapter-react'
import { PublicKey, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { useState, useEffect, useCallback } from 'react'
import { Program, AnchorProvider, BN } from '@coral-xyz/anchor'
import { useAnchorWallet, useConnection } from '@solana/wallet-adapter-react'
import type { MultisigWallet } from '../../types/multisig_wallet'
import idl from '../../../assets/multisig_wallet.json'
import { toast } from 'sonner'

// Type definitions for account access
interface ProgramAccountsNamespace {
  multisigWallet: {
    fetch: (address: PublicKey) => Promise<MultisigWalletAccount>
    all: () => Promise<{ publicKey: PublicKey; account: MultisigWalletAccount }[]>
  }
  transactionProposal: {
    fetch: (address: PublicKey) => Promise<TransactionProposalAccount>
  }
}

interface MultisigWalletAccount {
  owners: PublicKey[]
  ownerCount: number
  threshold: number
  nonce: number
  bump: number
}

interface TransactionProposalAccount {
  wallet: PublicKey
  proposer: PublicKey
  amount: BN
  recipient: PublicKey
  approvals: boolean[]
  ownerCount: number
  executed: boolean
  cancelled: boolean
  expiresAt: BN
  bump: number
}

// Helper functions for PDA calculation (from test file)
function getWalletAddress(payer: PublicKey, programId: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("multisig_wallet"), payer.toBuffer()],
    programId
  );
}

function getProposalAddress(wallet: PublicKey, nonce: number, programId: PublicKey) {
  // Convert nonce to little-endian bytes to match &wallet.nonce.to_le_bytes()
  const nonceBuffer = Buffer.alloc(1);
  nonceBuffer.writeUInt8(nonce, 0);

  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("transaction_proposal"),
      wallet.toBuffer(),
      nonceBuffer
    ],
    programId
  );
}

// Create the Anchor program instance
function getProgram(connection: any, wallet: any) {
  const provider = new AnchorProvider(connection, wallet, {
    commitment: 'confirmed'
  })

  return new Program(idl as MultisigWallet, provider)
}

// Helper to create Solscan links
function getSolscanLink(signature: string, cluster: string = 'devnet') {
  return `https://solscan.io/tx/${signature}?cluster=${cluster}`
}

interface WalletInfo {
  address: PublicKey
  owners: PublicKey[]
  ownerCount: number
  threshold: number
  nonce: number
  balance: number
}

interface TransactionProposal {
  address: PublicKey
  wallet: PublicKey
  proposer: PublicKey
  amount: BN
  recipient: PublicKey
  approvals: boolean[]
  ownerCount: number
  executed: boolean
  cancelled: boolean
  expiresAt: BN
}

export function DashboardFeature() {
  const { publicKey } = useWallet()
  const { connection } = useConnection()
  const wallet = useAnchorWallet()

  // Create wallet states
  const [loading, setLoading] = useState(false)
  const [owners, setOwners] = useState('')
  const [threshold, setThreshold] = useState(2)

  // Existing wallet states
  const [allWallets, setAllWallets] = useState<WalletInfo[]>([])
  const [selectedWalletIndex, setSelectedWalletIndex] = useState<number>(0)
  const [proposals, setProposals] = useState<TransactionProposal[]>([])

  // Transaction proposal states
  const [proposeAmount, setProposeAmount] = useState('')
  const [proposeRecipient, setProposeRecipient] = useState('')
  const [proposeHours, setProposeHours] = useState(24)

  // UI states
  const [status, setStatus] = useState<string>('')
  const [logs, setLogs] = useState<string[]>([])
  const [activeTab, setActiveTab] = useState<'create' | 'manage'>('create')

  // Computed value for current selected wallet
  const walletInfo = allWallets.length > 0 ? allWallets[selectedWalletIndex] : null

  // Get the Anchor program instance
  const program = wallet ? getProgram(connection, wallet) : null

  const addLog = useCallback((message: string) => {
    console.log(message)
    setLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`])
  }, [])

  // Fetch existing wallet info - find ALL wallets where user is an owner
  const fetchWalletInfo = useCallback(async () => {
    if (!publicKey || !program) return

    try {
      const foundWallets: WalletInfo[] = []

      // Method 1: Check if current user is the payer/creator of a wallet
      try {
        const [payerWalletPda] = getWalletAddress(publicKey, program.programId)
        const account = await connection.getAccountInfo(payerWalletPda)
        if (account) {
          const walletAccount = await (program.account as ProgramAccountsNamespace).multisigWallet.fetch(payerWalletPda)
          const isOwner = walletAccount.owners
            .slice(0, walletAccount.ownerCount)
            .some((owner: PublicKey) => owner.toBase58() === publicKey.toBase58())

          if (isOwner) {
            const balance = await connection.getBalance(payerWalletPda)
            foundWallets.push({
              address: payerWalletPda,
              owners: walletAccount.owners.slice(0, walletAccount.ownerCount),
              ownerCount: walletAccount.ownerCount,
              threshold: walletAccount.threshold,
              nonce: walletAccount.nonce,
              balance: balance / LAMPORTS_PER_SOL
            })
          }
        }
      } catch (error) {
        // Not the payer, continue searching
      }

      // Method 2: Search through all multisig wallets for additional ones
      try {
        // Get all multisig wallet accounts
        const allWalletsData = await (program.account as ProgramAccountsNamespace).multisigWallet.all()

        for (const wallet of allWalletsData) {
          const walletAccount = wallet.account
          const isOwner = walletAccount.owners
            .slice(0, walletAccount.ownerCount)
            .some((owner: PublicKey) => owner.toBase58() === publicKey.toBase58())

          // Check if we haven't already added this wallet (avoid duplicates)
          const alreadyAdded = foundWallets.some(w => w.address.toBase58() === wallet.publicKey.toBase58())

          if (isOwner && !alreadyAdded) {
            const balance = await connection.getBalance(wallet.publicKey)
            foundWallets.push({
              address: wallet.publicKey,
              owners: walletAccount.owners.slice(0, walletAccount.ownerCount),
              ownerCount: walletAccount.ownerCount,
              threshold: walletAccount.threshold,
              nonce: walletAccount.nonce,
              balance: balance / LAMPORTS_PER_SOL
            })
          }
        }
      } catch (error) {
        console.warn('Could not fetch all wallets:', error)
      }

      setAllWallets(foundWallets)
      // Reset selected index if we have fewer wallets now
      if (foundWallets.length > 0 && selectedWalletIndex >= foundWallets.length) {
        setSelectedWalletIndex(0)
      }

      addLog(`Found ${foundWallets.length} multisig wallet(s) where you are an owner`)

    } catch (error) {
      console.error('Error fetching wallet info:', error)
      setAllWallets([])
    }
  }, [publicKey, program, connection, selectedWalletIndex, addLog])

  // Load wallet info when component mounts or wallet changes (only run once per wallet)
  useEffect(() => {
    let isMounted = true
    if (publicKey && program && isMounted) {
      fetchWalletInfo()
    }
    return () => {
      isMounted = false
    }
  }, [publicKey?.toString(), program?.programId.toString()])

  // Fetch pending proposals
  const fetchProposals = useCallback(async () => {
    if (!walletInfo || !program) return

    try {
      // We'll fetch proposals by checking potential PDAs for the wallet's nonce range
      // In a real app, you'd use program.account.transactionProposal.all() with filters
      const proposals: TransactionProposal[] = []

      // Check the last few nonces for any proposals (simplified approach)
      for (let i = Math.max(0, walletInfo.nonce - 5); i <= walletInfo.nonce + 2; i++) {
        try {
          const [proposalPda] = getProposalAddress(walletInfo.address, i, program.programId)
          const proposalAccount = await (program.account as ProgramAccountsNamespace).transactionProposal.fetch(proposalPda)

          // Only include if not executed and not cancelled
          if (!proposalAccount.executed && !proposalAccount.cancelled) {
            proposals.push({
              address: proposalPda,
              wallet: proposalAccount.wallet,
              proposer: proposalAccount.proposer,
              amount: proposalAccount.amount,
              recipient: proposalAccount.recipient,
              approvals: proposalAccount.approvals,
              ownerCount: proposalAccount.ownerCount,
              executed: proposalAccount.executed,
              cancelled: proposalAccount.cancelled,
              expiresAt: proposalAccount.expiresAt
            })
          }
        } catch (error) {
          // Proposal doesn't exist for this nonce, which is normal
        }
      }

      setProposals(proposals)
      console.log(`Found ${proposals.length} pending proposals`)
    } catch (error) {
      console.error('Error fetching proposals:', error)
      setProposals([])
    }
  }, [walletInfo, program])

  // Auto-fetch proposals when wallet info is first available
  const walletAddressString = walletInfo?.address.toString()
  useEffect(() => {
    if (walletInfo && program && proposals.length === 0) {
      const timeoutId = setTimeout(() => {
        fetchProposals()
      }, 1000) // Small delay to avoid rapid re-renders

      return () => clearTimeout(timeoutId)
    }
  }, [walletAddressString, walletInfo, program, proposals.length, fetchProposals])

  const createWallet = async () => {
    if (!publicKey || !wallet || !program) {
      setStatus('Please connect your wallet first')
      return
    }

    if (!owners.trim()) {
      setStatus('Please enter owner addresses')
      return
    }

    setLoading(true)
    setStatus('Starting wallet creation...')
    setLogs([])

    try {
      addLog('=== 🚀 Starting Anchor Multisig Wallet Creation ===')
      addLog(`Connected wallet: ${publicKey.toBase58()}`)
      addLog(`Using connection: ${connection.rpcEndpoint}`)

      // Parse owner addresses
      const ownerAddresses = owners.split(',').map(addr => {
        const trimmed = addr.trim()
        try {
          return new PublicKey(trimmed)
        } catch {
          throw new Error(`Invalid public key: ${trimmed}`)
        }
      })

      addLog(`Parsed ${ownerAddresses.length} owners`)

      // Validations
      if (ownerAddresses.length < 2 || ownerAddresses.length > 10) {
        throw new Error('Must have between 2 and 10 owners')
      }
      if (threshold < 1 || threshold > ownerAddresses.length) {
        throw new Error('Threshold must be between 1 and number of owners')
      }

      addLog(`Threshold: ${threshold}`)

      // Find wallet PDA using the program
      const [walletPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('multisig_wallet'), publicKey.toBuffer()],
        program.programId
      )
      addLog(`Wallet PDA: ${walletPda.toBase58()}`)

      // Check if wallet already exists using raw account check
      const existingAccount = await connection.getAccountInfo(walletPda)
      if (existingAccount) {
        throw new Error('Multisig wallet already exists for this payer')
      }
      addLog('✅ Wallet PDA available')

      addLog('🏗️ Building transaction with Anchor...')

      // Use Anchor's simple methods API - this is the magic!
      addLog('📡 Sending transaction with Anchor...')
      const txSignature = await program.methods
        .createWallet(ownerAddresses, threshold)
        .accounts({
          wallet: walletPda,
          payer: publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc()

      addLog(`✅ Transaction sent! Signature: ${txSignature}`)
      addLog('=== 🎉 WALLET CREATED SUCCESSFULLY! ===')
      addLog(`🔗 Solscan: ${getSolscanLink(txSignature)}`)
      addLog(`📍 Wallet PDA: ${walletPda.toBase58()}`)
      setStatus(`🎉 Multisig wallet created successfully! View on Solscan: ${getSolscanLink(txSignature)}`)

      // Show success toast with Solscan link
      const solscanUrl = getSolscanLink(txSignature)
      toast.success('🎉 Multisig Wallet Created!', {
        description: 'Your multisig wallet has been successfully created.',
        action: {
          label: 'View on Solscan',
          onClick: () => window.open(solscanUrl, '_blank')
        }
      })

      // Verify the wallet was created by checking the account
      try {
        const createdAccount = await connection.getAccountInfo(walletPda)
        if (createdAccount) {
          addLog(`✅ Wallet verification: Account created with ${createdAccount.data.length} bytes`)
        } else {
          addLog(`⚠️ Could not verify wallet creation - account not found`)
        }
      } catch (fetchError) {
        addLog(`⚠️ Could not verify wallet creation: ${fetchError}`)
      }

      // Clear form and refresh wallet info
      setOwners('')
      setThreshold(2)
      await fetchWalletInfo() // Refresh to show all wallets including the new one
      addLog('💡 Wallet created! Switch to "Manage Wallets" tab to use it.')

    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : `${error}`
      addLog(`❌ ERROR: ${errorMsg}`)
      setStatus(`❌ Error: ${errorMsg}`)

      // Try to extract more specific error information from Anchor
      if (error && typeof error === 'object' && 'error' in error) {
        const anchorError = error as { error?: { errorMessage?: string } }
        if (anchorError.error?.errorMessage) {
          addLog(`Anchor error: ${anchorError.error.errorMessage}`)
        }
      }
      if (error && typeof error === 'object' && 'logs' in error) {
        const logsError = error as { logs?: string[] }
        if (logsError.logs) {
          addLog(`Transaction logs: ${logsError.logs.join(' | ')}`)
        }
      }

      console.error('Error creating wallet:', error)
    } finally {
      setLoading(false)
    }
  }

  const proposeTransaction = async () => {
    if (!publicKey || !program || !walletInfo) {
      setStatus('Please connect wallet and ensure you have a multisig wallet')
      return
    }

    if (!proposeAmount || !proposeRecipient) {
      setStatus('Please enter amount and recipient')
      return
    }

    setLoading(true)
    setLogs([])

    try {
      addLog('=== 💡 Proposing Transaction ===')

      const amount = parseFloat(proposeAmount) * LAMPORTS_PER_SOL
      const recipient = new PublicKey(proposeRecipient)

      // Calculate proposal PDA
      const [proposalPda] = getProposalAddress(walletInfo.address, walletInfo.nonce, program.programId)

      addLog(`Proposing ${proposeAmount} SOL to ${recipient.toBase58()}`)
      addLog(`Proposal PDA: ${proposalPda.toBase58()}`)

      const txSignature = await program.methods
        .proposeTransaction(
          new BN(amount),
          recipient,
          new BN(proposeHours)
        )
        .accounts({
          proposal: proposalPda,
          wallet: walletInfo.address,
          proposer: publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc()

      addLog('=== 🎉 TRANSACTION PROPOSED! ===')
      addLog(`🔗 Solscan: ${getSolscanLink(txSignature)}`)
      setStatus(`Transaction proposed successfully! View on Solscan: ${getSolscanLink(txSignature)}`)

      // Show success toast with Solscan link
      const solscanUrl = getSolscanLink(txSignature)
      toast.success('💡 Transaction Proposed!', {
        description: `Proposed ${proposeAmount} SOL to ${recipient.toBase58().slice(0, 8)}...`,
        action: {
          label: 'View on Solscan',
          onClick: () => window.open(solscanUrl, '_blank')
        }
      })

      // Clear form and refresh proposals
      setProposeAmount('')
      setProposeRecipient('')
      await fetchProposals()

    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : `${error}`
      addLog(`❌ ERROR: ${errorMsg}`)
      setStatus(`❌ Error: ${errorMsg}`)
      console.error('Error proposing transaction:', error)
    } finally {
      setLoading(false)
    }
  }

  const approveTransaction = async (proposalAddress: PublicKey) => {
    if (!publicKey || !program || !walletInfo) return

    setLoading(true)
    setLogs([])

    try {
      addLog('=== ✅ Approving Transaction ===')

      const txSignature = await program.methods
        .approveTransaction()
        .accounts({
          proposal: proposalAddress,
          wallet: walletInfo.address,
          approver: publicKey,
        })
        .rpc()

      addLog('=== 🎉 TRANSACTION APPROVED! ===')
      addLog(`🔗 Solscan: ${getSolscanLink(txSignature)}`)
      setStatus(`Transaction approved! View on Solscan: ${getSolscanLink(txSignature)}`)

      // Show success toast with Solscan link
      const solscanUrl = getSolscanLink(txSignature)
      toast.success('✅ Transaction Approved!', {
        description: 'Your approval has been recorded successfully.',
        action: {
          label: 'View on Solscan',
          onClick: () => window.open(solscanUrl, '_blank')
        }
      })

      await fetchProposals()

    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : `${error}`
      addLog(`❌ ERROR: ${errorMsg}`)
      setStatus(`❌ Error: ${errorMsg}`)
      console.error('Error approving transaction:', error)
    } finally {
      setLoading(false)
    }
  }

  const executeTransaction = async (proposalAddress: PublicKey, recipient: PublicKey) => {
    if (!publicKey || !program || !walletInfo) return

    setLoading(true)
    setLogs([])

    try {
      addLog('=== 🚀 Executing Transaction ===')

      // Check recipient balance and rent exemption requirement
      const recipientBalance = await connection.getBalance(recipient)
      const rentExemption = await connection.getMinimumBalanceForRentExemption(0) // Empty account

      addLog(`Recipient current balance: ${recipientBalance / LAMPORTS_PER_SOL} SOL`)
      addLog(`Rent exemption requirement: ${rentExemption / LAMPORTS_PER_SOL} SOL`)

      // Get the proposal details to check transfer amount
      const proposalAccount = await (program.account as ProgramAccountsNamespace).transactionProposal.fetch(proposalAddress)
      const transferAmount = proposalAccount.amount.toNumber()

      addLog(`Transfer amount: ${transferAmount / LAMPORTS_PER_SOL} SOL`)

      // Check if recipient will have enough for rent after transfer
      const finalBalance = recipientBalance + transferAmount
      if (finalBalance < rentExemption) {
        throw new Error(`Transfer would leave recipient with insufficient funds for rent. Required: ${rentExemption / LAMPORTS_PER_SOL} SOL, would have: ${finalBalance / LAMPORTS_PER_SOL} SOL`)
      }

      const txSignature = await program.methods
        .executeTransaction()
        .accounts({
          proposal: proposalAddress,
          wallet: walletInfo.address,
          walletAccount: walletInfo.address,
          recipient: recipient,
          executor: publicKey,
        })
        .rpc()

      addLog('=== 🎉 TRANSACTION EXECUTED! ===')
      addLog(`🔗 Solscan: ${getSolscanLink(txSignature)}`)
      setStatus(`Transaction executed successfully! View on Solscan: ${getSolscanLink(txSignature)}`)

      // Show success toast with Solscan link
      const solscanUrl = getSolscanLink(txSignature)
      toast.success('🚀 Transaction Executed!', {
        description: `Successfully transferred ${transferAmount / LAMPORTS_PER_SOL} SOL to recipient.`,
        action: {
          label: 'View on Solscan',
          onClick: () => window.open(solscanUrl, '_blank')
        }
      })

      await fetchProposals()
      await fetchWalletInfo() // Refresh wallet balance

    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : `${error}`
      addLog(`❌ ERROR: ${errorMsg}`)
      setStatus(`❌ Error: ${errorMsg}`)

      // Add helpful message for rent issues
      if (errorMsg.includes('insufficient funds for rent')) {
        addLog(`💡 TIP: The recipient needs at least 0.00089 SOL for rent exemption. Send a slightly larger amount or ensure the recipient has some SOL already.`)
      }

      console.error('Error executing transaction:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <AppHero title="🔐 Anchor Multisig Wallet" subtitle="Complete multisig wallet management using Coral XYZ Anchor" />

      <div className="max-w-6xl mx-auto py-6 px-4 space-y-6">


        {/* Wallet Connection */}
        <div className="flex justify-center">
          <WalletButton />
        </div>

        {/* Main Content */}
        {publicKey && (
          <>
            {/* Tab Navigation */}
            <div className="border-b border-gray-200 dark:border-gray-700">
              <nav className="-mb-px flex space-x-8" aria-label="Tabs">
                <button
                  onClick={() => setActiveTab('create')}
                  className={`py-2 px-1 border-b-2 font-medium text-sm ${activeTab === 'create'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                >
                  Create Wallet
                </button>
                <button
                  onClick={() => setActiveTab('manage')}
                  disabled={allWallets.length === 0}
                  className={`py-2 px-1 border-b-2 font-medium text-sm flex items-center space-x-1 ${activeTab === 'manage' && allWallets.length > 0
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 disabled:opacity-50'
                    }`}
                >
                  <span>Manage Wallet{allWallets.length > 1 ? 's' : ''}</span>
                  {allWallets.length > 0 && <span className="text-green-500">✓{allWallets.length > 1 ? allWallets.length : ''}</span>}
                </button>
              </nav>
            </div>

            {/* Tab Content */}
            {activeTab === 'create' && (
              <div className="bg-white dark:bg-gray-900 p-6 rounded-lg border shadow-sm">
                <div className='flex justify-between items-center'>
                  <h2 className="text-xl font-bold mb-4">Create Multisig Wallet</h2>
                  <button
                    onClick={() => window.open('https://faucet.solana.com/', '_blank')}
                    className="text-green-600 hover:text-green-800 text-sm"
                  >
                    💧 Get Devnet SOL
                  </button>
                </div>


                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Owners (comma-separated addresses)
                    </label>
                    <textarea
                      className="w-full p-3 border rounded-md dark:bg-gray-800"
                      placeholder={`${publicKey.toBase58()}, [other owner addresses...]`}
                      value={owners || publicKey.toBase58()}
                      onChange={(e) => setOwners(e.target.value)}
                      rows={3}
                    />
                    <p className="text-sm text-gray-500 mt-1">
                      Include your own address and at least one other owner (2-10 total)
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Threshold (signatures required)
                    </label>
                    <input
                      type="number"
                      className="w-full p-3 border rounded-md dark:bg-gray-800"
                      value={threshold}
                      onChange={(e) => setThreshold(parseInt(e.target.value))}
                      min={1}
                      max={10}
                    />
                    <p className="text-sm text-gray-500 mt-1">
                      Number of owner signatures required to execute transactions
                    </p>
                  </div>

                  <button
                    onClick={createWallet}
                    disabled={loading || !owners.trim() || !program}
                    className="w-full bg-blue-600 text-white py-3 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? '⚓ Creating with Anchor...' : '⚓ Create Multisig Wallet'}
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'manage' && allWallets.length > 0 && (
              <div className="space-y-6">
                {/* Wallet Selector */}
                {allWallets.length > 1 && (
                  <div className="bg-white dark:bg-gray-900 p-4 rounded-lg border shadow-sm">
                    <h3 className="text-lg font-semibold mb-3">Select Wallet to Manage</h3>
                    <select
                      value={selectedWalletIndex}
                      onChange={(e) => setSelectedWalletIndex(parseInt(e.target.value))}
                      className="w-full p-3 border rounded-md dark:bg-gray-800"
                    >
                      {allWallets.map((wallet, index) => (
                        <option key={wallet.address.toBase58()} value={index}>
                          Wallet {index + 1}: {wallet.address.toBase58().slice(0, 8)}...{wallet.address.toBase58().slice(-8)}
                          ({wallet.balance.toFixed(4)} SOL, {wallet.ownerCount} owners, {wallet.threshold}/{wallet.ownerCount} threshold)
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Wallet Info */}
                  <div className="bg-white dark:bg-gray-900 p-6 rounded-lg border shadow-sm">
                    <h2 className="text-xl font-bold mb-4">
                      Wallet Information {allWallets.length > 1 && <span className="text-sm font-normal text-gray-500">(Wallet {selectedWalletIndex + 1} of {allWallets.length})</span>}
                    </h2>
                    <div className="space-y-3">
                      <div>
                        <label className="text-sm font-medium text-gray-500">Address</label>
                        <p className="font-mono text-sm break-all">{walletInfo?.address.toBase58()}</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-500">Balance</label>
                        <p className="text-lg font-bold">{walletInfo?.balance.toFixed(4)} SOL</p>
                      </div>
                      <div className="flex space-x-4">
                        <div>
                          <label className="text-sm font-medium text-gray-500">Owners</label>
                          <p className="font-bold">{(walletInfo?.ownerCount || 0) > 0 ? walletInfo?.ownerCount : 'Loading...'}</p>
                        </div>
                        <div>
                          <label className="text-sm font-medium text-gray-500">Threshold</label>
                          <p className="font-bold">{(walletInfo?.threshold || 0) > 0 ? walletInfo?.threshold : 'Loading...'}</p>
                        </div>
                        <div>
                          <label className="text-sm font-medium text-gray-500">Nonce</label>
                          <p className="font-bold">{walletInfo?.nonce}</p>
                        </div>
                      </div>
                      <div className="flex space-x-3">
                        <button
                          onClick={fetchWalletInfo}
                          className="text-blue-600 hover:text-blue-800 text-sm"
                        >
                          🔄 Refresh
                        </button>
                        <button
                          onClick={() => window.open('https://faucet.solana.com/', '_blank')}
                          className="text-green-600 hover:text-green-800 text-sm"
                        >
                          💧 Get Devnet SOL
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Propose Transaction */}
                  <div className="bg-white dark:bg-gray-900 p-6 rounded-lg border shadow-sm">
                    <h2 className="text-xl font-bold mb-4">Propose Transaction</h2>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium mb-2">Amount (SOL)</label>
                        <input
                          type="number"
                          step="0.001"
                          className="w-full p-3 border rounded-md dark:bg-gray-800"
                          value={proposeAmount}
                          onChange={(e) => setProposeAmount(e.target.value)}
                          placeholder="0.1"
                        />
                        <p className="text-xs text-amber-600 mt-1">
                          💡 Note: Recipients need at least 0.00089 SOL for rent exemption. Consider this when sending to new addresses.
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Recipient Address</label>
                        <input
                          type="text"
                          className="w-full p-3 border rounded-md dark:bg-gray-800"
                          value={proposeRecipient}
                          onChange={(e) => setProposeRecipient(e.target.value)}
                          placeholder="Recipient public key..."
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Expires In (Hours)</label>
                        <input
                          type="number"
                          className="w-full p-3 border rounded-md dark:bg-gray-800"
                          value={proposeHours}
                          onChange={(e) => setProposeHours(parseInt(e.target.value))}
                          min={1}
                        />
                      </div>
                      <button
                        onClick={proposeTransaction}
                        disabled={loading || !proposeAmount || !proposeRecipient}
                        className="w-full bg-green-600 text-white py-3 px-4 rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {loading ? '💡 Proposing...' : '💡 Propose Transaction'}
                      </button>
                    </div>
                  </div>

                  {/* Pending Proposals */}
                  <div className="lg:col-span-2 bg-white dark:bg-gray-900 p-6 rounded-lg border shadow-sm">
                    <div className="flex justify-between items-center mb-4">
                      <h2 className="text-xl font-bold">Pending Proposals</h2>
                      <button
                        onClick={fetchProposals}
                        disabled={loading}
                        className="text-blue-600 hover:text-blue-800 text-sm disabled:opacity-50"
                      >
                        🔄 Refresh Proposals
                      </button>
                    </div>
                    {proposals.length === 0 ? (
                      <p className="text-gray-500 text-center py-8">
                        No pending proposals. Create a proposal to get started!
                      </p>
                    ) : (
                      <div className="space-y-4">
                        {proposals.map((proposal, index) => (
                          <div key={index} className="border rounded-lg p-4">
                            <div className="flex justify-between items-start">
                              <div className="flex-1">
                                <p className="font-medium">
                                  {proposal.amount.toNumber() / LAMPORTS_PER_SOL} SOL → {proposal.recipient.toBase58()}
                                </p>
                                <p className="text-sm text-gray-500">
                                  Proposed by: {proposal.proposer.toBase58()}
                                </p>
                                <p className="text-sm text-gray-500">
                                  Approvals: {proposal.approvals.filter(Boolean).length} / {proposal.ownerCount}
                                  {walletInfo && proposal.approvals.filter(Boolean).length >= walletInfo.threshold && (
                                    <span className="ml-2 text-green-600 font-semibold">✓ Ready to Execute</span>
                                  )}
                                </p>
                                <p className="text-xs text-gray-400 font-mono">
                                  Proposal: {proposal.address.toBase58()}
                                </p>
                              </div>
                              <div className="space-x-2">
                                {(() => {
                                  // Check if current user has already approved
                                  const currentUserIndex = walletInfo?.owners.findIndex(owner =>
                                    owner.toBase58() === publicKey?.toBase58()
                                  ) ?? -1
                                  const hasApproved = currentUserIndex !== -1 && proposal.approvals[currentUserIndex]

                                  return (
                                    <button
                                      onClick={() => approveTransaction(proposal.address)}
                                      disabled={loading || hasApproved}
                                      className={`px-3 py-1 rounded text-sm ${hasApproved
                                          ? 'bg-gray-400 text-white cursor-not-allowed'
                                          : 'bg-yellow-600 text-white hover:bg-yellow-700'
                                        } disabled:opacity-50`}
                                    >
                                      {hasApproved ? '✅ Approved' : '✅ Approve'}
                                    </button>
                                  )
                                })()}
                                {(() => {
                                  const hasEnoughApprovals = walletInfo && proposal.approvals.filter(Boolean).length >= walletInfo.threshold
                                  return (
                                    <button
                                      onClick={() => executeTransaction(proposal.address, proposal.recipient)}
                                      disabled={loading || !hasEnoughApprovals}
                                      className={`px-3 py-1 rounded text-sm ${hasEnoughApprovals
                                          ? 'bg-blue-600 text-white hover:bg-blue-700'
                                          : 'bg-gray-400 text-white cursor-not-allowed'
                                        } disabled:opacity-50`}
                                    >
                                      🚀 Execute
                                    </button>
                                  )
                                })()}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* Status Display */}
        {status && (
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-4 rounded-lg">
            <h3 className="font-semibold text-blue-800 dark:text-blue-200 mb-2">Status</h3>
            <p className="text-blue-700 dark:text-blue-300">{status}</p>
          </div>
        )}

        {/* Console Logs */}
        {logs.length > 0 && (
          <div className="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm">
            <h3 className="font-semibold mb-2">Anchor Logs</h3>
            <div className="space-y-1 max-h-96 overflow-y-auto">
              {logs.map((log, index) => (
                <div key={index} className="whitespace-pre-wrap">{log}</div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}