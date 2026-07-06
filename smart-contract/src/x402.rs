use odra::casper_types::{PublicKey, Signature};
use odra::prelude::Address;
use casper_eip_712::prelude::*;
use casper_eip_712::casper_native::TransferAuthorization;

pub fn guildnet_domain(chain_name: &str, package_hash: [u8; 32]) -> DomainSeparator {
    DomainBuilder::new()
        .name("GuildNet")
        .version("1")
        .custom_field("chain_name", DomainFieldValue::String(chain_name.into()))
        .custom_field(
            "contract_package_hash",
            DomainFieldValue::Bytes32(package_hash),
        )
        .build()
}

pub fn compute_auth_digest(
    domain: &DomainSeparator,
    from: [u8; 32],
    to: [u8; 32],
    value: [u8; 32],
    valid_after: u64,
    valid_before: u64,
    nonce: [u8; 32],
) -> [u8; 32] {
    let auth = TransferAuthorization {
        from,
        to,
        value,
        valid_after,
        valid_before,
        nonce,
    };
    hash_typed_data(domain, &auth)
}

pub fn verify_auth(
    domain: &DomainSeparator,
    from: [u8; 32],
    to: [u8; 32],
    value: [u8; 32],
    valid_after: u64,
    valid_before: u64,
    nonce: [u8; 32],
    public_key: &PublicKey,
    signature: &Signature,
) -> bool {
    let digest = compute_auth_digest(domain, from, to, value, valid_after, valid_before, nonce);
    match (public_key, signature) {
        (PublicKey::Ed25519(vk), Signature::Ed25519(sig)) => {
            use ed25519_dalek::Verifier;
            vk.verify(&digest, sig).is_ok()
        }
        _ => false,
    }
}

pub fn address_to_account_hash(addr: &Address) -> [u8; 32] {
    match addr {
        Address::Account(ah) => {
            let mut buf = [0u8; 32];
            buf.copy_from_slice(ah.as_ref());
            buf
        }
        Address::Contract(_) => [0u8; 32],
    }
}

pub fn u256_to_bytes32(value: &odra::casper_types::U256) -> [u8; 32] {
    let mut buf = [0u8; 32];
    value.to_big_endian(&mut buf);
    buf
}

/// Convert raw signature bytes (with or without Ed25519 tag) to a Casper `Signature`.
/// The Odra test signer emits the tag byte (0x01 for Ed25519) + 64-byte sig = 65 bytes.
pub fn raw_ed25519_to_signature(raw: &[u8]) -> Option<Signature> {
    let bytes = if raw.len() == 65 && raw[0] == 0x01 {
        &raw[1..]
    } else if raw.len() == 64 {
        raw
    } else {
        return None;
    };
    let mut arr = [0u8; 64];
    arr.copy_from_slice(bytes);
    Some(Signature::Ed25519(arr.into()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use odra::casper_types::bytesrepr::Bytes;

    #[test]
    fn digest_is_deterministic() {
        let domain = guildnet_domain("casper-test", [0xAA; 32]);
        let d1 = compute_auth_digest(&domain, [0x11; 32], [0x22; 32], [0u8; 32], 0, 999, [0xBB; 32]);
        let d2 = compute_auth_digest(&domain, [0x11; 32], [0x22; 32], [0u8; 32], 0, 999, [0xBB; 32]);
        assert_eq!(d1, d2);
    }

    #[test]
    fn different_nonce_changes_digest() {
        let domain = guildnet_domain("casper-test", [0xAA; 32]);
        let d1 = compute_auth_digest(&domain, [0x11; 32], [0x22; 32], [0u8; 32], 0, 999, [0xBB; 32]);
        let d2 = compute_auth_digest(&domain, [0x11; 32], [0x22; 32], [0u8; 32], 0, 999, [0xCC; 32]);
        assert_ne!(d1, d2);
    }

    #[test]
    fn verify_auth_with_test_signer() {
        let env = odra_test::env();
        let sender = env.get_account(0);
        let public_key = env.public_key(&sender);
        let from_hash = address_to_account_hash(&sender);

        let to_hash = [0x22; 32];
        let value = [0u8; 32];
        let nonce = [0xBB; 32];

        let domain = guildnet_domain("casper-test", [0xAA; 32]);
        let digest = compute_auth_digest(&domain, from_hash, to_hash, value, 0, 9_999_999_999, nonce);
        let msg = Bytes::from(digest.to_vec());
        let sig_raw = env.sign_message(&msg, &sender);
        let sig = raw_ed25519_to_signature(sig_raw.as_ref()).unwrap();

        assert!(verify_auth(
            &domain, from_hash, to_hash, value, 0, 9_999_999_999, nonce, &public_key, &sig,
        ));

        let wrong_value = {
            let mut buf = [0u8; 32];
            odra::casper_types::U256::from(1u64).to_big_endian(&mut buf);
            buf
        };
        assert!(!verify_auth(
            &domain, from_hash, to_hash, wrong_value, 0, 9_999_999_999, nonce, &public_key, &sig,
        ));
    }
}
