'use client'

import { AppHero } from '@/components/app-hero'
import { useConnection, useWallet, useAnchorWallet } from '@solana/wallet-adapter-react'
import { PublicKey, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { Program, AnchorProvider, web3, BN, Idl } from '@coral-xyz/anchor'
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base'
import { useState, useEffect, useCallback } from 'react'

// Program ID from your deployed program
const PROGRAM_ID = new PublicKey('35QKMhSqHXEm4NamvyHiTH5DLCvkZKC6h3tqxmXZvAM1')

// Type for the program
type MultisigWalletProgram = Program<typeof MULTISIG_IDL>

// Basic IDL structure for your multisig program
const MULTISIG_IDL = {
  version: "0.1.0",
  name: "multisig_wallet",
  instructions: [
    {
      name: "createWallet",
      accounts: [
        { name: "wallet", isMut: true, isSigner: false },
        { name: "payer", isMut: true, isSigner: true },
        { name: "systemProgram", isMut: false, isSigner: false }
      ],
      args: [
        { name: "owners", type: { vec: "publicKey" } },
        { name: "threshold", type: "u8" }
      ]
    },
    {
      name: "proposeTransaction",
      accounts: [
        { name: "proposal", isMut: true, isSigner: false },
        { name: "wallet", isMut: true, isSigner: false },
        { name: "proposer", isMut: true, isSigner: true },
        { name: "systemProgram", isMut: false, isSigner: false }
      ],
      args: [
        { name: "amount", type: "u64" },
        { name: "recipient", type: "publicKey" },
        { name: "expiresInHours", type: "u64" }
      ]
    },
    {
      name: "approveTransaction",
      accounts: [
        { name: "proposal", isMut: true, isSigner: false },
        { name: "wallet", isMut: false, isSigner: false },
        { name: "approver", isMut: false, isSigner: true }
      ],
      args: []
    },
    {
      name: "executeTransaction",
      accounts: [
        { name: "proposal", isMut: true, isSigner: false },
        { name: "wallet", isMut: true, isSigner: false },
        { name: "walletAccount", isMut: true, isSigner: false },
        { name: "recipient", isMut: true, isSigner: false },
        { name: "executor", isMut: false, isSigner: true }
      ],
      args: []
    },
    {
      name: "cancelTransaction",
      accounts: [
        { name: "proposal", isMut: true, isSigner: false },
        { name: "wallet", isMut: false, isSigner: false },
        { name: "canceller", isMut: false, isSigner: true }
      ],
      args: []
    }
  ],
  accounts: [
    {
      name: "multisigWallet",
      type: {
        kind: "struct",
        fields: [
          { name: "owners", type: { array: ["publicKey", 10] } },
          { name: "ownerCount", type: "u8" },
          { name: "threshold", type: "u8" },
          { name: "nonce", type: "u8" },
          { name: "bump", type: "u8" }
        ]
      }
    },
    {
      name: "transactionProposal",
      type: {
        kind: "struct",
        fields: [
          { name: "wallet", type: "publicKey" },
          { name: "proposer", type: "publicKey" },
          { name: "amount", type: "u64" },
          { name: "recipient", type: "publicKey" },
          { name: "approvals", type: { array: ["bool", 10] } },
          { name: "ownerCount", type: "u8" },
          { name: "executed", type: "bool" },
          { name: "cancelled", type: "bool" },
          { name: "expiresAt", type: "i64" },
          { name: "bump", type: "u8" }
        ]
      }
    }
  ]
} as const

interface MultisigWallet {
  owners: PublicKey[]
  ownerCount: number
  threshold: number
  nonce: number
  bump: number
}

interface TransactionProposal {
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

export function DashboardFeature() {
  const { connection } = useConnection()
  const { publicKey, sendTransaction } = useWallet()
  const wallet = useAnchorWallet()
  const [program, setProgram] = useState<Program | null>(null)
  const [multisigWallet, setMultisigWallet] = useState<MultisigWallet | null>(null)
  const [walletPda, setWalletPda] = useState<PublicKey | null>(null)
  const [proposals, setProposals] = useState<(TransactionProposal & { publicKey: PublicKey })[]>([])
  const [loading, setLoading] = useState(false)

  // Form states
  const [owners, setOwners] = useState<string>('')
  const [threshold, setThreshold] = useState<number>(2)
  const [recipient, setRecipient] = useState<string>('')
  const [amount, setAmount] = useState<string>('')
  const [expiresInHours, setExpiresInHours] = useState<number>(24)

  // Initialize program
  useEffect(() => {
    if (wallet && connection) {
      try {
        const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' })
        const program = new Program(MULTISIG_IDL as Idl, PROGRAM_ID, provider)
        setProgram(program)
      } catch (error) {
        console.error('Error initializing program:', error)
      }
    }
  }, [wallet, connection])

  // Get wallet PDA
  const getWalletPda = useCallback((payer: PublicKey) => {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('multisig_wallet'), payer.toBuffer()],
      PROGRAM_ID
    )[0]
  }, [])

  // Get proposal PDA
  const getProposalPda = useCallback((wallet: PublicKey, nonce: number) => {
    const nonceBuffer = Buffer.alloc(1)
    nonceBuffer.writeUInt8(nonce, 0)
    return PublicKey.findProgramAddressSync(
      [Buffer.from('transaction_proposal'), wallet.toBuffer(), nonceBuffer],
      PROGRAM_ID
    )[0]
  }, [])

  // Load wallet data
  const loadWallet = useCallback(async () => {
    if (!program || !publicKey) return

    try {
      const walletPda = getWalletPda(publicKey)
      setWalletPda(walletPda)
      
      // Use any casting for account fetching due to IDL limitations
      const walletAccount = await (program.account as any).multisigWallet.fetch(walletPda)
      setMultisigWallet(walletAccount as MultisigWallet)

      // Load proposals with proper filtering
      const allProposals = await (program.account as any).transactionProposal.all([
        {
          memcmp: {
            offset: 8, // Skip discriminator
            bytes: walletPda.toBase58(),
          },
        },
      ])
      
      setProposals(allProposals.map((p: any) => ({ 
        ...p.account as TransactionProposal, 
        publicKey: p.publicKey 
      })))
    } catch (error) {
      console.log('Wallet not found or error loading:', error)
      setMultisigWallet(null)
      setProposals([])
    }
  }, [program, publicKey, getWalletPda])

  useEffect(() => {
    loadWallet()
  }, [loadWallet])

  // Create wallet
  const createWallet = async () => {
    if (!program || !publicKey) return

    setLoading(true)
    try {
      const ownerPubkeys = owners.split(',').map(addr => new PublicKey(addr.trim()))
      const walletPda = getWalletPda(publicKey)

      const tx = await program.methods
        .createWallet(ownerPubkeys, threshold)
        .accounts({
          wallet: walletPda,
          payer: publicKey,
          systemProgram: SystemProgram.programId,
        })
        .transaction()

      const signature = await sendTransaction(tx, connection)
      await connection.confirmTransaction(signature, 'confirmed')
      
      console.log('Wallet created:', signature)
      await loadWallet()
    } catch (error) {
      console.error('Error creating wallet:', error)
    }
    setLoading(false)
  }

  // Propose transaction
  const proposeTransaction = async () => {
    if (!program || !publicKey || !walletPda || !multisigWallet) return

    setLoading(true)
    try {
      const recipientPubkey = new PublicKey(recipient)
      const amountLamports = new BN(parseFloat(amount) * LAMPORTS_PER_SOL)
      const proposalPda = getProposalPda(walletPda, multisigWallet.nonce)

      const tx = await program.methods
        .proposeTransaction(amountLamports, recipientPubkey, new BN(expiresInHours))
        .accounts({
          proposal: proposalPda,
          wallet: walletPda,
          proposer: publicKey,
          systemProgram: SystemProgram.programId,
        })
        .transaction()

      const signature = await sendTransaction(tx, connection)
      await connection.confirmTransaction(signature, 'confirmed')
      
      console.log('Transaction proposed:', signature)
      await loadWallet()
    } catch (error) {
      console.error('Error proposing transaction:', error)
    }
    setLoading(false)
  }

  // Approve transaction
  const approveTransaction = async (proposalPda: PublicKey) => {
    if (!program || !publicKey || !walletPda) return

    setLoading(true)
    try {
      const tx = await program.methods
        .approveTransaction()
        .accounts({
          proposal: proposalPda,
          wallet: walletPda,
          approver: publicKey,
        })
        .transaction()

      const signature = await sendTransaction(tx, connection)
      await connection.confirmTransaction(signature, 'confirmed')
      
      console.log('Transaction approved:', signature)
      await loadWallet()
    } catch (error) {
      console.error('Error approving transaction:', error)
    }
    setLoading(false)
  }

  // Execute transaction
  const executeTransaction = async (proposal: TransactionProposal & { publicKey: PublicKey }) => {
    if (!program || !publicKey || !walletPda) return

    setLoading(true)
    try {
      const tx = await program.methods
        .executeTransaction()
        .accounts({
          proposal: proposal.publicKey,
          wallet: walletPda,
          walletAccount: walletPda,
          recipient: proposal.recipient,
          executor: publicKey,
        })
        .transaction()

      const signature = await sendTransaction(tx, connection)
      await connection.confirmTransaction(signature, 'confirmed')
      
      console.log('Transaction executed:', signature)
      await loadWallet()
    } catch (error) {
      console.error('Error executing transaction:', error)
    }
    setLoading(false)
  }

  // Cancel transaction
  const cancelTransaction = async (proposalPda: PublicKey) => {
    if (!program || !publicKey || !walletPda) return

    setLoading(true)
    try {
      const tx = await program.methods
        .cancelTransaction()
        .accounts({
          proposal: proposalPda,
          wallet: walletPda,
          canceller: publicKey,
        })
        .transaction()

      const signature = await sendTransaction(tx, connection)
      await connection.confirmTransaction(signature, 'confirmed')
      
      console.log('Transaction cancelled:', signature)
      await loadWallet()
    } catch (error) {
      console.error('Error cancelling transaction:', error)
    }
    setLoading(false)
  }

  if (!publicKey) {
    return (
      <div>
        <AppHero title="Multisig Wallet" subtitle="Connect your wallet to get started" />
        <div className="max-w-xl mx-auto py-6 text-center">
          <p>Please connect your Solana wallet to use the multisig features.</p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <AppHero title="Multisig Wallet" subtitle="Secure collaborative wallet management" />
      
      <div className="max-w-4xl mx-auto py-6 px-4 space-y-8">
        
        {/* Wallet Status */}
        <div className="bg-gray-50 dark:bg-gray-800 p-6 rounded-lg">
          <h2 className="text-xl font-bold mb-4">Wallet Status</h2>
          {multisigWallet ? (
            <div className="space-y-2">
              <p><strong>Owners:</strong> {multisigWallet.ownerCount}</p>
              <p><strong>Threshold:</strong> {multisigWallet.threshold}</p>
              <p><strong>Nonce:</strong> {multisigWallet.nonce}</p>
              <p><strong>Wallet Address:</strong> {walletPda?.toBase58()}</p>
              <div className="mt-4">
                <h3 className="font-semibold">Owner Addresses:</h3>
                <ul className="text-sm space-y-1">
                  {multisigWallet.owners.slice(0, multisigWallet.ownerCount).map((owner, i) => (
                    <li key={i} className="font-mono">{owner.toBase58()}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <p>No wallet found for this address.</p>
          )}
        </div>

        {/* Create Wallet */}
        {!multisigWallet && (
          <div className="bg-white dark:bg-gray-900 p-6 rounded-lg border">
            <h2 className="text-xl font-bold mb-4">Create Multisig Wallet</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Owners (comma-separated addresses)
                </label>
                <textarea
                  className="w-full p-3 border rounded-md dark:bg-gray-800"
                  placeholder="Enter owner public keys separated by commas"
                  value={owners}
                  onChange={(e) => setOwners(e.target.value)}
                  rows={3}
                />
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
              </div>
              <button
                onClick={createWallet}
                disabled={loading || !owners.trim()}
                className="w-full bg-blue-600 text-white py-3 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? 'Creating...' : 'Create Wallet'}
              </button>
            </div>
          </div>
        )}

        {/* Propose Transaction */}
        {multisigWallet && (
          <div className="bg-white dark:bg-gray-900 p-6 rounded-lg border">
            <h2 className="text-xl font-bold mb-4">Propose Transaction</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Recipient Address</label>
                <input
                  type="text"
                  className="w-full p-3 border rounded-md dark:bg-gray-800"
                  placeholder="Recipient public key"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Amount (SOL)</label>
                <input
                  type="number"
                  step="0.001"
                  className="w-full p-3 border rounded-md dark:bg-gray-800"
                  placeholder="0.0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Expires In (hours)</label>
                <input
                  type="number"
                  className="w-full p-3 border rounded-md dark:bg-gray-800"
                  value={expiresInHours}
                  onChange={(e) => setExpiresInHours(parseInt(e.target.value))}
                  min={1}
                />
              </div>
              <div className="flex items-end">
                <button
                  onClick={proposeTransaction}
                  disabled={loading || !recipient.trim() || !amount.trim()}
                  className="w-full bg-green-600 text-white py-3 px-4 rounded-md hover:bg-green-700 disabled:opacity-50"
                >
                  {loading ? 'Proposing...' : 'Propose Transaction'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Proposals List */}
        {multisigWallet && proposals.length > 0 && (
          <div className="bg-white dark:bg-gray-900 p-6 rounded-lg border">
            <h2 className="text-xl font-bold mb-4">Transaction Proposals</h2>
            <div className="space-y-4">
              {proposals.map((proposal, index) => {
                const approvalCount = proposal.approvals.slice(0, proposal.ownerCount).filter(Boolean).length
                const isExpired = Date.now() / 1000 > proposal.expiresAt.toNumber()
                const canExecute = approvalCount >= multisigWallet.threshold && !proposal.executed && !proposal.cancelled && !isExpired
                
                return (
                  <div key={index} className="border rounded-lg p-4 space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <p><strong>To:</strong> {proposal.recipient.toBase58()}</p>
                        <p><strong>Amount:</strong> {(proposal.amount.toNumber() / LAMPORTS_PER_SOL).toFixed(3)} SOL</p>
                        <p><strong>Approvals:</strong> {approvalCount}/{multisigWallet.threshold}</p>
                        <p><strong>Proposed by:</strong> {proposal.proposer.toBase58()}</p>
                        <p><strong>Expires:</strong> {new Date(proposal.expiresAt.toNumber() * 1000).toLocaleString()}</p>
                      </div>
                      <div className="text-right">
                        {proposal.executed && <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-sm">Executed</span>}
                        {proposal.cancelled && <span className="bg-red-100 text-red-800 px-2 py-1 rounded text-sm">Cancelled</span>}
                        {isExpired && !proposal.executed && !proposal.cancelled && <span className="bg-gray-100 text-gray-800 px-2 py-1 rounded text-sm">Expired</span>}
                        {!proposal.executed && !proposal.cancelled && !isExpired && (
                          <span className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded text-sm">Pending</span>
                        )}
                      </div>
                    </div>
                    
                    {!proposal.executed && !proposal.cancelled && !isExpired && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => approveTransaction(proposal.publicKey)}
                          disabled={loading}
                          className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50 text-sm"
                        >
                          Approve
                        </button>
                        {canExecute && (
                          <button
                            onClick={() => executeTransaction(proposal)}
                            disabled={loading}
                            className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 disabled:opacity-50 text-sm"
                          >
                            Execute
                          </button>
                        )}
                        <button
                          onClick={() => cancelTransaction(proposal.publicKey)}
                          disabled={loading}
                          className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 disabled:opacity-50 text-sm"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {multisigWallet && proposals.length === 0 && (
          <div className="bg-gray-50 dark:bg-gray-800 p-6 rounded-lg text-center">
            <p>No transaction proposals yet. Create your first proposal above!</p>
          </div>
        )}
      </div>
    </div>
  )
}