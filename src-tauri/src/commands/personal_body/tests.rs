use super::*;
use std::{
    path::PathBuf,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

fn temporary_root() -> PathBuf {
    let path = std::env::temp_dir().join(format!(
        "standin-client-body-{}-{}",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    fs::create_dir_all(path.join("cards")).unwrap();
    path
}
fn fixture() -> Card {
    Card {
        local_model_id: "00000000-0000-4000-8000-000000000001".into(),
        worker_model_id: "00000000-0000-4000-8000-000000000002".into(),
        name: "私の体型".into(),
        source_hash: "a".repeat(64),
        format: "fbx".into(),
        version: 1,
        importer_version: "1".into(),
        normalization_version: "1".into(),
        rig_mapping_version: "1".into(),
        converter_version: "1".into(),
        converter_fingerprint: "a".repeat(64),
        created_at: 1,
        updated_at: 1,
        capabilities: json!({"bodyPose":true,"leftHand":false,"rightHand":false}),
    }
}
#[test]
fn card_survives_restart_and_private_worker_id_is_not_returned() {
    let root = temporary_root();
    let mut model = fixture();
    save_card(&root, &model).unwrap();
    let reread = cards(&root).unwrap().pop().unwrap();
    assert_eq!(reread.worker_model_id, model.worker_model_id);
    assert_eq!(reread.name, model.name);
    let public = serde_json::to_value(&reread).unwrap();
    assert!(public.get("workerModelId").is_none());
    model.name = "Renamed".into();
    model.version = 2;
    save_card(&root, &model).unwrap();
    assert_eq!(cards(&root).unwrap().len(), 1);
    assert_eq!(cards(&root).unwrap()[0].version, 2);
    fs::remove_dir_all(root).unwrap();
}
#[test]
fn malformed_ids_names_and_corrupt_cards_fail_closed() {
    assert!(!valid_id("../../source"));
    assert!(!valid_id("x"));
    assert!(clean_name(" ").is_err());
    assert!(clean_name("a\nb").is_err());
    let root = temporary_root();
    fs::write(root.join("cards/bad.json"), b"{}").unwrap();
    assert!(cards(&root).is_err());
    fs::remove_dir_all(root).unwrap();
}
#[test]
#[ignore = "Requires packaged runtime and permitted FBX/BVH fixtures via STANDIN_TEST_*; executes the real native NDJSON adapter"]
fn real_packaged_worker_import_apply_export_restart_delete() {
    let runtime = PathBuf::from(std::env::var("STANDIN_TEST_LAUNCHER").expect("packaged launcher"));
    let source = PathBuf::from(std::env::var("STANDIN_TEST_FBX").expect("permitted FBX"));
    let pose = PathBuf::from(std::env::var("STANDIN_TEST_BVH").expect("final BVH fixture"));
    let root = temporary_root();
    let cancel = AtomicBool::new(false);
    let model_id = "00000000-0000-4000-8000-000000000001";
    let source_hash = hash(&fs::read(&source).unwrap());
    let pose_hash = hash(&fs::read(&pose).unwrap());
    {
        let mut session = Session::start_from(&runtime, &root).unwrap();
        let hello = session
            .request(None, "hello", &cancel, json!({"action":"hello"}))
            .unwrap();
        assert_eq!(hello["formats"]["fbx"], true);
        let imported=session.request(None,"import",&cancel,json!({"action":"import","localModelId":model_id,"sourcePath":source,"sourceHash":source_hash})).unwrap();
        assert_eq!(imported["sourceHash"], source_hash);
        assert_eq!(imported["capabilities"]["bodyPose"], true);
        let mut saved = fixture();
        saved.worker_model_id = model_id.into();
        save_card(&root, &saved).unwrap();
    }
    assert_eq!(cards(&root).unwrap().len(), 1);
    {
        let mut session = Session::start_from(&runtime, &root).unwrap();
        let inspected = session
            .request(
                None,
                "inspect",
                &cancel,
                json!({"action":"inspect","localModelId":model_id}),
            )
            .unwrap();
        assert_eq!(inspected["sourceHash"], source_hash);
        let result=session.request(None,"apply",&cancel,json!({"action":"apply","localModelId":model_id,"sourceHash":source_hash,"posePath":pose,"poseHash":pose_hash,"selectionId":"selection","hands":{"left":null,"right":null}})).unwrap();
        assert_eq!(result["snapshot"]["poseHash"], pose_hash);
        let destination = root.join("saved.fbx");
        let exported=session.request(None,"export",&cancel,json!({"action":"export","localModelId":model_id,"snapshotHash":result["snapshotHash"],"destinationPath":destination})).unwrap();
        assert_eq!(
            hash(&fs::read(&destination).unwrap()),
            exported["artifactHash"].as_str().unwrap()
        );
        if let Some(copy) = std::env::var_os("STANDIN_TEST_EXPORT_COPY") { fs::copy(&destination, copy).unwrap(); }
        session
            .request(
                None,
                "delete",
                &cancel,
                json!({"action":"delete","localModelId":model_id}),
            )
            .unwrap();
        assert!(destination.is_file());
    }
    fs::remove_dir_all(root).unwrap();
}

#[test]
#[ignore = "Requires real packaged runtime and a permitted FBX via STANDIN_TEST_*; tests child cancellation/cleanup"]
fn real_packaged_worker_cancel_does_not_publish_model() {
    let launcher =
        PathBuf::from(std::env::var("STANDIN_TEST_LAUNCHER").expect("packaged launcher"));
    let source = PathBuf::from(std::env::var("STANDIN_TEST_FBX").expect("permitted FBX"));
    let root = std::env::temp_dir().join(format!(
        "standin-client-cancel-{}",
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    fs::create_dir_all(&root).unwrap();
    let cancelled = Arc::new(AtomicBool::new(false));
    {
        let mut session = Session::start_from(&launcher, &root).unwrap();
        session
            .request(
                None,
                "cancelhello",
                &AtomicBool::new(false),
                json!({"action":"hello"}),
            )
            .unwrap();
        let flag = cancelled.clone();
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(500));
            flag.store(true, Ordering::SeqCst);
        });
        let result=session.request(None,"canceltest",&cancelled,json!({"action":"import","localModelId":"cancel-model","sourcePath":source,"sourceHash":hash(&fs::read(&source).unwrap())}));
        assert_eq!(result.unwrap_err().code, "CANCELLED");
    }
    assert!(!root.join("worker/models/cancel-model").exists());
    assert_eq!(
        fs::read_dir(root.join("worker/staging")).unwrap().count(),
        0
    );
    fs::remove_dir_all(root).unwrap();
}
#[test]
#[ignore = "Requires packaged runtime and actual CS3C fixture via STANDIN_TEST_*; unsupported format must not publish a model"]
fn real_packaged_worker_cs3c_is_rejected_without_success_card() {
    let launcher =
        PathBuf::from(std::env::var("STANDIN_TEST_LAUNCHER").expect("packaged launcher"));
    let source = PathBuf::from(std::env::var("STANDIN_TEST_CS3C").expect("CS3C fixture"));
    let root = std::env::temp_dir().join(format!(
        "standin-client-cs3c-{}",
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    fs::create_dir_all(&root).unwrap();
    {
        let mut session = Session::start_from(&launcher, &root).unwrap();
        let result=session.request(None,"cs3ctest",&AtomicBool::new(false),json!({"action":"import","localModelId":"cs3c-model","sourcePath":source,"sourceHash":hash(&fs::read(&source).unwrap())}));
        assert_eq!(result.unwrap_err().code, "CS3C_DECODER_UNAVAILABLE");
    }
    assert!(!root.join("worker/models/cs3c-model").exists());
    assert_eq!(
        fs::read_dir(root.join("worker/staging")).unwrap().count(),
        0
    );
    fs::remove_dir_all(root).unwrap();
}
#[test]
fn sweep_preserves_registered_models_and_user_exports() {
    let root = std::env::temp_dir().join(format!(
        "standin-client-sweep-{}",
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    fs::create_dir_all(root.join("cards")).unwrap();
    let orphan = "00000000-0000-4000-8000-000000000001";
    fs::create_dir_all(root.join("worker/models").join(orphan)).unwrap();
    fs::create_dir_all(root.join("staging").join(orphan)).unwrap();
    fs::write(root.join("user-saved.fbx"), b"FBX").unwrap();
    sweep(&root).unwrap();
    assert!(!root.join("worker/models").join(orphan).exists());
    assert!(!root.join("staging").join(orphan).exists());
    assert!(root.join("user-saved.fbx").exists());
    fs::remove_dir_all(root).unwrap();
}
