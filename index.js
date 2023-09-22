const express = require('express');
const app = express();
const bitcoin = require('bitcoinjs-lib');
const bip39 = require('bip39');
const ecc = require('tiny-secp256k1');
const { BIP32Factory } = require('bip32');
const bip32 = BIP32Factory(ecc);


const PORT = process.env.PORT || 3000;

app.use(express.json());

const customNetwork = {
    messagePrefix: '\x18Bitcoin Signed Message:\n',
    bech32: 'bc',
    bip32: {
      public: 0x0488B21E, // Custom public key prefix (EXT_PUBLIC_KEY)
      private: 0x0488ADE4, // Custom private key prefix (EXT_SECRET_KEY)
    },
    pubKeyHash: 25, // Custom public key hash prefix (PUBKEY_ADDRESS)
    scriptHash: 26, // Custom script hash prefix (SCRIPT_ADDRESS)
  };

// Generate Bitcoin Mnemonic
app.get('/generate', (req, res) => {
    const mnemonic = bip39.generateMnemonic(192);
    const seed = bip39.mnemonicToSeedSync(mnemonic);
    const root = bip32.fromSeed(seed);
  
    // Derive a Bitcoin address from the root
    const childNode = root.derivePath("m/44'/0'/0'/0/0");
    
    // Get the private key in Wallet Import Format (WIF)
    const privateKey = childNode.toWIF();

    const { address } = bitcoin.payments.p2pkh({ pubkey: childNode.publicKey, network: customNetwork });
  
    res.json({ mnemonic, privateKey, address });
  });

// Access Existing Wallet using provided mnemonic
app.post('/access-wallet', (req, res) => {
  const providedMnemonic = req.body.mnemonic; // Get mnemonic from request body

  try {
    // Verify if the provided mnemonic is valid
    if (!bip39.validateMnemonic(providedMnemonic)) {
      return res.status(400).json({ error: 'Invalid mnemonic' });
    }

    // Derive wallet information from the provided mnemonic
    const seed = bip39.mnemonicToSeedSync(providedMnemonic);
    const root = bip32.fromSeed(seed);

    // Derive a Bitcoin address from the root
    const childNode = root.derivePath("m/44'/0'/0'/0/0");

    // Get the private key in Wallet Import Format (WIF)
    const privateKey = childNode.toWIF();

    const { address } = bitcoin.payments.p2pkh({
      pubkey: childNode.publicKey,
      network: customNetwork,
    });

    res.json({ privateKey, address });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Generate Subaddress for a Main Address
app.post('/generate-subaddress', (req, res) => {
    const mainAddress = req.body.mainAddress;
    const mainAddressNode = bitcoin.address.fromBase58Check(mainAddress);

    // Derive a subaddress from the main address (you can adjust the path as needed)
    const subAddressNode = mainAddressNode.derive(0).derive(0);

    // Get the subaddress in Base58 format
    const subAddress = bitcoin.address.toBase58Check(subAddressNode.publicKey, customNetwork.pubKeyHash);

    res.json({ subAddress });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
