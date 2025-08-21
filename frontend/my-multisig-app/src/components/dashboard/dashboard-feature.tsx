'use client'

import { AppHero } from '@/components/app-hero'
import { WalletButton } from '@/components/solana/solana-provider'
import { useWallet } from '@solana/wallet-adapter-react'
import { PublicKey, SystemProgram } from '@solana/web3.js'
import { useState } from 'react'
import { Program, AnchorProvider } from '@coral-xyz/anchor'
import { useAnchorWallet, useConnection } from '@solana/wallet-adapter-react'
import type { MultisigWallet } from '../../types/multisig_wallet'
import idl from '../../../assets/multisig_wallet.json'

// Create the Anchor program instance
function getProgram(connection: any, wallet: any) {
  const provider = new AnchorProvider(connection, wallet, {
    commitment: 'confirmed'
  })
  
  return new Program(idl as MultisigWallet, provider)
}

export function DashboardFeature() {
  const { publicKey } = useWallet()
  const { connection } = useConnection()
  const wallet = useAnchorWallet()
  const [loading, setLoading] = useState(false)
  const [owners, setOwners] = useState('')
  const [threshold, setThreshold] = useState(2)
  const [status, setStatus] = useState<string>('')
  const [logs, setLogs] = useState<string[]>([])

  // Get the Anchor program instance
  const program = wallet ? getProgram(connection, wallet) : null

  const addLog = (message: string) => {
    console.log(message)
    setLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`])
  }

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
        } catch (e) {
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
      addLog(`🔗 Explorer: https://explorer.solana.com/tx/${txSignature}?cluster=devnet`)
      addLog(`📍 Wallet PDA: ${walletPda.toBase58()}`)
      setStatus(`🎉 Multisig wallet created successfully! Signature: ${txSignature}`)
      
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
      
      // Clear form
      setOwners('')
      setThreshold(2)
      
    } catch (error: any) {
      const errorMsg = error.message || `${error}`
      addLog(`❌ ERROR: ${errorMsg}`)
      setStatus(`❌ Error: ${errorMsg}`)
      
      // Try to extract more specific error information from Anchor
      if (error.error && error.error.errorMessage) {
        addLog(`Anchor error: ${error.error.errorMessage}`)
      }
      if (error.logs) {
        addLog(`Transaction logs: ${error.logs.join(' | ')}`)
      }
      
      console.error('Error creating wallet:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <AppHero title="🔐 Anchor Multisig Wallet" subtitle="Easy multisig wallet creation using Coral XYZ Anchor" />
      
      <div className="max-w-4xl mx-auto py-6 px-4 space-y-6">
        {/* Anchor Integration Notice */}
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-4 rounded-lg">
          <h3 className="font-semibold text-blue-800 dark:text-blue-200 mb-2">⚓ Anchor Integration</h3>
          <p className="text-blue-700 dark:text-blue-300 text-sm">
            Now using the official @coral-xyz/anchor client library for seamless Solana program interaction.
            This provides automatic instruction building, account resolution, and error handling.
          </p>
        </div>

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