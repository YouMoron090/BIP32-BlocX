const express = require('express');
const app = express();
const bitcoin = require('bitcoinjs-lib');
const bip39 = require('bip39');
const ecc = require('tiny-secp256k1');
const { BIP32Factory } = require('bip32');
const bip32 = BIP32Factory(ecc);
const axios = require('axios');

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
    wif: 153,
  };

// Generate Bitcoin Mnemonic
app.get('/generate', (req, res) => {
    const mnemonic = bip39.generateMnemonic(192);
    const seed = bip39.mnemonicToSeedSync(mnemonic);
    const root = bip32.fromSeed(seed, customNetwork);
  
    // Derive a Bitcoin address from the root
    const childNode = root.derivePath("m/44'/5'/950'/0/0");
    
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
    const root = bip32.fromSeed(seed, customNetwork);

    // Derive a Bitcoin address from the root
    const childNode = root.derivePath("m/44'/5'/950'/0/0");

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
    const mainAddressPrivateKey = req.body.mainAddressPrivateKey;

    // Check if the mainAddressPrivateKey is provided
    if (!mainAddressPrivateKey || typeof mainAddressPrivateKey !== 'string' || mainAddressPrivateKey.length !== 64) {
        return res.status(400).json({ error: 'Invalid mainAddressPrivateKey' });
    }

    // Create a bip32 node from the main address's private key
    const mainAddressNode = bip32.fromPrivateKey(Buffer.from(mainAddressPrivateKey, 'hex'), customNetwork);

    // Derive a subaddress from the main address (you can adjust the path as needed)
    const subAddressNode = mainAddressNode.derive(0).derive(0);

    // Get the subaddress in Base58 format
    const subAddress = bitcoin.payments.p2pkh({ pubkey: subAddressNode.publicKey, network: customNetwork }).address;

    res.json({ subAddress });
});

// Retrieve Private Key by Mnemonic and Address
app.post('/get-private-key', (req, res) => {
    const mnemonic = req.body.mnemonic;
    const address = req.body.address;

    try {
        // Verify if the provided mnemonic is valid
        if (!bip39.validateMnemonic(mnemonic)) {
            return res.status(400).json({ error: 'Invalid mnemonic' });
        }

        // Derive wallet information from the provided mnemonic
        const seed = bip39.mnemonicToSeedSync(mnemonic);
        const root = bip32.fromSeed(seed);

        // Derive the child node corresponding to the provided address
        const addressNode = root.derivePath("m/44'/0'/0'/0/0"); // Adjust the path as needed

        // Generate the address from the derived node
        const { address: derivedAddress } = bitcoin.payments.p2pkh({
            pubkey: addressNode.publicKey,
            network: customNetwork,
        });

        // Check if the derived address matches the provided address
        if (derivedAddress !== address) {
            return res.status(400).json({ error: 'Address does not match the mnemonic' });
        }

        // Get the private key in Wallet Import Format (WIF)
        const privateKey = addressNode.toWIF();

        res.json({ privateKey });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});


app.post('/addresslist', (req, res) => {
  // const mnemonic = bip39.generateMnemonic();
  const mnemonic = req.body.mnemonic;

  const seed = bip39.mnemonicToSeedSync(mnemonic);
  const root = bip32.fromSeed(seed, customNetwork);
  console.log(seed)

  let addresses = [];
  for (let i = 0; i < 10; i++) {

    // Derive a Bitcoin address from the root
    const childNode = root.derivePath("m/44'/5'/950'/0/" + i);

    // Get the private key in Wallet Import Format (WIF)
    const privateKey = childNode.toWIF();

    const { address } = bitcoin.payments.p2pkh({ pubkey: childNode.publicKey, network: customNetwork });
    addresses.push({ privateKey, address });
  }
  res.json({ mnemonic, addressList: addresses });
});

app.post('/addresstx', async (req, res) => {
    const mnemonic = req.body.mnemonic;
    const seed = bip39.mnemonicToSeedSync(mnemonic);
    const root = bip32.fromSeed(seed, customNetwork);
  
    let addresses = [];
    for (let i = 0; i < 10; i++) {
      const childNode = root.derivePath(`m/44'/5'/950'/0/${i}`);
      const { address } = bitcoin.payments.p2pkh({ pubkey: childNode.publicKey, network: customNetwork });
      addresses.push({ privateKey: childNode.toWIF(), address });
    }
  
    // Fetch transaction details for each address
    const transactionsPromises = addresses.map(async ({ address }) => {
      const apiUrl = `https://explorer.blocx.space/ext/getaddresstxs/${address}/0/50`;
      const response = await axios.get(apiUrl);
      return { address, transactions: response.data };
    });
  
    const transactions = await Promise.all(transactionsPromises);
  
    res.json({ transactions });
  });

//GET MNEMONICS
// Retrieve Mnemonic by Address and Private Key
app.post('/get-mnemonic', (req, res) => {
  const address = req.body.address;
  const privateKey = req.body.privateKey;

  try {
    // Create a bip32 node from the private key
    const rootNode = bip32.fromPrivateKey(Buffer.from(privateKey, 'hex'), customNetwork);

    // Derive a Bitcoin address from the derived node
    const { address: derivedAddress } = bitcoin.payments.p2pkh({
      pubkey: rootNode.publicKey,
      network: customNetwork,
    });

    // Check if the derived address matches the provided address
    if (derivedAddress !== address) {
      return res.status(400).json({ error: 'Address does not match the private key' });
    }

    // Derive the mnemonic from the root node's private key
    const seedBuffer = rootNode.privateKey;
    const mnemonic = bip39.entropyToMnemonic(seedBuffer.slice(0, 16)); // 16 bytes of entropy

    res.json({ mnemonic });
  } catch (error) {
    console.error(error);
    res.send(error);
  }
});



app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
