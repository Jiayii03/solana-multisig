'use client'

import { AppHero } from '@/components/app-hero'
import { WalletButton } from '@/components/solana/solana-provider'
import { useWallet } from '@solana/wallet-adapter-react'
import { useConnection } from '@solana/wallet-adapter-react'
import { PublicKey, SystemProgram, Transaction, TransactionInstruction } from '@solana/web3.js'
import { useState } from 'react'

// Program ID from your IDL
const PROGRAM_ID = new PublicKey('E2Qi8w3Fz3SduddbegzS1SVAjogPae6AceUGmTwkCRez')

// Instruction discriminator for create_wallet
const CREATE_WALLET_DISCRIMINATOR = Buffer.from([82, 172, 128, 18, 161, 207, 88, 63])

const links: { label: string; href: string }[] = [
  { label: 'Solana Docs', href: 'https://docs.solana.com/' },
  { label: 'Solana Faucet', href: 'https://faucet.solana.com/' },
  { label: 'Solana Cookbook', href: 'https://solana.com/developers/cookbook/' },
  { label: 'Solana Stack Overflow', href: 'https://solana.stackexchange.com/' },
  { label: 'Solana Developers GitHub', href: 'https://github.com/solana-developers/' },
]

export function DashboardFeature() {
  const { publicKey, sendTransaction } = useWallet()
  const { connection } = useConnection()
  const [loading, setLoading] = useState(false)
  const [owners, setOwners] = useState('')
  const [threshold, setThreshold] = useState(2)
  const [status, setStatus] = useState<string>('')
  const [logs, setLogs] = useState<string[]>([])

  const addLog = (message: string) => {
    console.log(message)
    setLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`])
  }

  const createWallet = async () => {
    if (!publicKey || !sendTransaction) {
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
      addLog('=== Starting Multisig Wallet Creation ===')
      addLog(`Connected wallet: ${publicKey.toBase58()}`)
      addLog(`Connection endpoint: ${connection.rpcEndpoint}`)
      
      // Parse owner addresses
      const ownerAddresses = owners.split(',').map(addr => new PublicKey(addr.trim()))
      addLog(`Parsed ${ownerAddresses.length} owners: ${ownerAddresses.map(o => o.toBase58()).join(', ')}`)
      
      // Validate we have 2-10 owners
      if (ownerAddresses.length < 2 || ownerAddresses.length > 10) {
        throw new Error('Must have between 2 and 10 owners')
      }

      // Validate threshold
      if (threshold < 1 || threshold > ownerAddresses.length) {
        throw new Error('Threshold must be between 1 and number of owners')
      }

      // Validate owners are not the program ID
      const invalidOwners = ownerAddresses.filter(owner => owner.equals(PROGRAM_ID))
      if (invalidOwners.length > 0) {
        throw new Error('Program ID cannot be an owner. Please use valid wallet addresses only.')
      }
      
      addLog(`Threshold set to: ${threshold}`)

      // Find wallet PDA
      const [walletPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('multisig_wallet'), publicKey.toBuffer()],
        PROGRAM_ID
      )
      addLog(`Wallet PDA: ${walletPda.toBase58()}`)
      addLog(`Program ID: ${PROGRAM_ID.toBase58()}`)

      // Serialize instruction data
      const ownersCount = ownerAddresses.length
      const buffer = Buffer.alloc(4 + (ownersCount * 32) + 1)
      
      let offset = 0
      buffer.writeUInt32LE(ownersCount, offset)
      offset += 4
      
      ownerAddresses.forEach(owner => {
        owner.toBuffer().copy(buffer, offset)
        offset += 32
      })
      
      buffer.writeUInt8(threshold, offset)
      
      addLog(`Serialized data length: ${buffer.length} bytes`)
      addLog(`Instruction discriminator: [${Array.from(CREATE_WALLET_DISCRIMINATOR).join(', ')}]`)

      // Create instruction
      const instruction = new TransactionInstruction({
        keys: [
          { pubkey: walletPda, isSigner: false, isWritable: true },
          { pubkey: publicKey, isSigner: true, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }
        ],
        programId: PROGRAM_ID,
        data: Buffer.concat([CREATE_WALLET_DISCRIMINATOR, buffer])
      })
      
      addLog('Created transaction instruction')
      addLog(`Instruction keys: ${instruction.keys.map(k => `${k.pubkey.toBase58()} (writable: ${k.isWritable}, signer: ${k.isSigner})`).join(', ')}`)

      // Create and send transaction
      const transaction = new Transaction().add(instruction)
      
      // Set fee payer and recent blockhash
      transaction.feePayer = publicKey
      const { blockhash } = await connection.getLatestBlockhash()
      transaction.recentBlockhash = blockhash
      
      addLog('Created transaction, sending...')
      addLog(`Fee payer: ${transaction.feePayer?.toBase58()}`)
      addLog(`Recent blockhash: ${transaction.recentBlockhash}`)
      
      // Simulate transaction first to catch errors
      addLog('Simulating transaction...')
      try {
        const simulation = await connection.simulateTransaction(transaction)
        addLog(`Simulation result: ${JSON.stringify(simulation)}`)
        
        if (simulation.value.err) {
          throw new Error(`Transaction simulation failed: ${JSON.stringify(simulation.value.err)}`)
        }
        
        addLog('Simulation successful, sending transaction...')
      } catch (simError) {
        addLog(`Simulation error: ${simError}`)
        throw simError
      }
      
      const signature = await sendTransaction(transaction, connection)
      addLog(`Transaction sent! Signature: ${signature}`)
      
      // Wait for confirmation with multiple strategies
      addLog('Waiting for confirmation...')
      
      try {
        // Try fast confirmation first
        const confirmation = await connection.confirmTransaction(signature, 'confirmed')
        addLog(`Confirmation status: ${JSON.stringify(confirmation)}`)
        
        if (confirmation.value.err) {
          throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`)
        }
        
        addLog('=== Wallet Created Successfully! ===')
        setStatus(`Multisig wallet created successfully! Signature: ${signature}`)
        
        // Clear form
        setOwners('')
        setThreshold(2)
      } catch (confirmError) {
        // If confirmation times out, check transaction status manually
        addLog(`Confirmation failed: ${confirmError}`)
        addLog('Checking transaction status manually...')
        
        try {
          // Wait a bit more and check again
          await new Promise(resolve => setTimeout(resolve, 5000))
          
          const txStatus = await connection.getSignatureStatus(signature)
          addLog(`Transaction status: ${JSON.stringify(txStatus)}`)
          
          if (txStatus.value?.err) {
            throw new Error(`Transaction failed: ${JSON.stringify(txStatus.value.err)}`)
          }
          
          if (txStatus.value?.confirmationStatus === 'confirmed' || txStatus.value?.confirmationStatus === 'finalized') {
            addLog('=== Wallet Created Successfully! ===')
            setStatus(`Multisig wallet created successfully! Signature: ${signature}`)
            setOwners('')
            setThreshold(2)
          } else {
            // Try to get transaction details to see what happened
            addLog('Getting transaction details...')
            try {
              const txDetails = await connection.getTransaction(signature, {
                commitment: 'confirmed',
                maxSupportedTransactionVersion: 0
              })
              addLog(`Transaction details: ${JSON.stringify(txDetails)}`)
              
              if (txDetails?.meta?.err) {
                throw new Error(`Transaction failed: ${JSON.stringify(txDetails.meta.err)}`)
              }
              
              if (txDetails?.meta) {
                addLog('=== Wallet Created Successfully! ===')
                setStatus(`Multisig wallet created successfully! Signature: ${signature}`)
                setOwners('')
                setThreshold(2)
              } else {
                throw new Error(`Transaction not found or not confirmed`)
              }
            } catch (txError) {
              addLog(`Transaction details error: ${txError}`)
              throw new Error(`Transaction may have failed. Check signature ${signature} on Solana Explorer`)
            }
          }
        } catch (statusError) {
          addLog(`Status check failed: ${statusError}`)
          throw new Error(`Transaction may have failed. Check signature ${signature} on Solana Explorer`)
        }
      }
    } catch (error) {
      const errorMsg = `Error creating wallet: ${error}`
      addLog(`ERROR: ${errorMsg}`)
      setStatus(errorMsg)
      console.error('Error creating wallet:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <AppHero title="Multisig Wallet" subtitle="Create and manage secure collaborative wallets" />
      
      <div className="max-w-4xl mx-auto py-6 px-4 space-y-6">
        {/* Wallet Connection */}
        <div className="flex justify-center">
          <WalletButton />
        </div>

        {/* Create Wallet Form */}
        {publicKey && (
          <div className="bg-white dark:bg-gray-900 p-6 rounded-lg border shadow-sm">
            <h2 className="text-xl font-bold mb-4">Create Multisig Wallet</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Owners (comma-separated addresses)
                </label>
                <textarea
                  className="w-full p-3 border rounded-md dark:bg-gray-800"
                  placeholder={`${publicKey.toBase58()}, [other owner addresses...]`}
                  value={owners}
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
                disabled={loading || !owners.trim()}
                className="w-full bg-blue-600 text-white py-3 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Creating Wallet...' : 'Create Multisig Wallet'}
              </button>
            </div>
          </div>
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
            <h3 className="font-semibold mb-2">Console Logs</h3>
            <div className="space-y-1 max-h-96 overflow-y-auto">
              {logs.map((log, index) => (
                <div key={index} className="whitespace-pre-wrap">{log}</div>
              ))}
            </div>
          </div>
        )}

        {/* Helpful Links */}
        <div className="text-center">
          <p className="text-gray-600 dark:text-gray-400 mb-4">Here are some helpful links to get you started.</p>
          <div className="space-y-2">
            {links.map((link, index) => (
              <div key={index}>
                <a
                  href={link.href}
                  className="hover:text-gray-500 dark:hover:text-gray-300"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {link.label}
                </a>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
