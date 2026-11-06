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
    exercise_packaged_model(runtime, source);
}
fn exercise_packaged_model(runtime: PathBuf, source: PathBuf) {
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
        assert_eq!(hello["modelStorageVersion"], "personal-fbx/1");
        let imported=session.request(None,"import",&cancel,json!({"action":"import","localModelId":model_id,"sourcePath":source,"sourceHash":source_hash})).unwrap();
        assert_eq!(imported["sourceHash"], source_hash);
        assert_eq!(imported["capabilities"]["bodyPose"], true);
        assert_eq!(imported["normalizedFormat"], "fbx");
        let normalized = PathBuf::from(imported["normalizedPath"].as_str().unwrap());
        assert_eq!(normalized.extension().unwrap(), "fbx");
        assert_eq!(
            hash(&fs::read(normalized).unwrap()),
            imported["normalizedHash"]
        );
        assert_eq!(
            hash(&fs::read(imported["archivePath"].as_str().unwrap()).unwrap()),
            imported["archiveHash"]
        );
        let mut saved = fixture();
        saved.worker_model_id = model_id.into();
        saved.source_hash = source_hash.clone();
        saved.format = source.extension().unwrap().to_string_lossy().to_lowercase();
        saved.importer_version = imported["versions"]["importerVersion"]
            .as_str()
            .unwrap()
            .into();
        saved.normalization_version = imported["versions"]["normalizationVersion"]
            .as_str()
            .unwrap()
            .into();
        saved.rig_mapping_version = imported["versions"]["rigMappingVersion"]
            .as_str()
            .unwrap()
            .into();
        saved.converter_version = imported["versions"]["converterVersion"]
            .as_str()
            .unwrap()
            .into();
        saved.converter_fingerprint = imported["versions"]["converterFingerprint"]
            .as_str()
            .unwrap()
            .into();
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
        let result=session.request(None,"apply",&cancel,json!({"action":"apply","localModelId":model_id,"sourceHash":source_hash,"posePath":pose,"poseHash":pose_hash,"selectionId":"selection","camera":{"version":"personal-camera/1","sourceBvhSha256":null,"rotation":null},"hands":{"left":null,"right":null}})).unwrap();
        assert_eq!(result["snapshot"]["poseHash"], pose_hash);
        let registered = card(&root, &fixture().local_model_id).unwrap();
        let camera = json!({"version":"personal-camera/1","sourceBvhSha256":null,"rotation":null});
        assert!(validate_snapshot(&registered, &pose_hash, &camera, &result["snapshot"]).is_ok());
        let changed = json!({"version":"personal-camera/1","sourceBvhSha256":pose_hash,"rotation":[[0,0,1],[0,1,0],[-1,0,0]]});
        assert!(validate_snapshot(&registered, &pose_hash, &changed, &result["snapshot"]).is_err());
        let destination = root.join("saved.fbx");
        let exported=session.request(None,"export",&cancel,json!({"action":"export","localModelId":model_id,"snapshotHash":result["snapshotHash"],"destinationPath":destination})).unwrap();
        assert_eq!(
            hash(&fs::read(&destination).unwrap()),
            exported["artifactHash"].as_str().unwrap()
        );
        if let Some(copy) = std::env::var_os("STANDIN_TEST_EXPORT_COPY") {
            fs::copy(&destination, copy).unwrap();
        }
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
fn real_packaged_worker_without_decoder_rejects_cs3c() {
    let launcher = PathBuf::from(
        std::env::var("STANDIN_TEST_LAUNCHER_NO_DECODER").expect("decoder-free packaged launcher"),
    );
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
        let hello = session
            .request(
                None,
                "hello",
                &AtomicBool::new(false),
                json!({"action":"hello"}),
            )
            .unwrap();
        assert_eq!(hello["formats"]["cs3c"], false);
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

#[test]
fn camera_is_a_versioned_proper_rotation_with_source_lineage() {
    assert!(validate_camera(
        &json!({"version":"personal-camera/1","sourceBvhSha256":null,"rotation":null})
    )
    .is_ok());
    let mut camera = json!({"version":"personal-camera/1","sourceBvhSha256":"a".repeat(64),"rotation":[[0,0,1],[0,1,0],[-1,0,0]]});
    assert!(validate_camera(&camera).is_ok());
    camera["rotation"] = json!([[-1, 0, 0], [0, 1, 0], [0, 0, 1]]);
    assert!(validate_camera(&camera).is_err());
    camera["rotation"] = json!([[2, 0, 0], [0, 1, 0], [0, 0, 1]]);
    assert!(validate_camera(&camera).is_err());
    assert!(validate_camera(&json!({})).is_err());
}

#[test]
#[ignore = "Requires decoder-enabled packaged runtime, permitted original CS3C and BVH"]
fn real_packaged_worker_with_decoder_imports_original_cs3c() {
    let runtime =
        PathBuf::from(std::env::var("STANDIN_TEST_LAUNCHER").expect("decoder-enabled launcher"));
    let source =
        PathBuf::from(std::env::var("STANDIN_TEST_CS3C").expect("permitted original CS3C"));
    exercise_packaged_model(runtime, source);
}

#[test]
#[ignore = "Requires separate immutable v10/v11 packages and permitted CS3C/BVH; exercises product registration/replacement core"]
fn real_v10_to_v11_reimport_invalidates_native_card_cache_and_snapshots() {
    let old_launcher =
        PathBuf::from(std::env::var("STANDIN_TEST_V10_LAUNCHER").expect("preserved v10 launcher"));
    let new_launcher =
        PathBuf::from(std::env::var("STANDIN_TEST_LAUNCHER").expect("candidate v11 launcher"));
    let source = PathBuf::from(std::env::var("STANDIN_TEST_CS3C").expect("permitted CS3C"));
    let pose = PathBuf::from(std::env::var("STANDIN_TEST_BVH").expect("recorded pose"));
    let root =
        PathBuf::from(std::env::var("STANDIN_TEST_MIGRATION_ROOT").expect("new private QA root"));
    assert!(!root.exists());
    fs::create_dir_all(root.join("cards")).unwrap();
    fs::create_dir_all(root.join("staging")).unwrap();
    fs::create_dir_all(root.join("user exports")).unwrap();
    let bytes = fs::read(&source).unwrap();
    let source_hash = hash(&bytes);
    let pose_hash = hash(&fs::read(&pose).unwrap());
    let cancel = AtomicBool::new(false);
    let context = || RequestContext {
        app: None,
        job: "migration",
        cancel: &cancel,
    };
    let mut runtime = RuntimeCache::default();
    let old_id = "00000000-0000-4000-8000-000000000011";
    let new_id = "00000000-0000-4000-8000-000000000012";
    let register =
        |runtime: &mut RuntimeCache, launcher: &Path, job: &str, replace_id: Option<&str>| {
            runtime
                .with_session(launcher, &root, context(), |session, hello| {
                    register_source(
                        Registration {
                            app: None,
                            root: &root,
                            job,
                            source_hash: source_hash.clone(),
                            bytes: bytes.clone(),
                            format: "cs3c".into(),
                            name: "migration original",
                            replace_id,
                            cancel: &cancel,
                        },
                        session,
                        hello,
                    )
                })
                .unwrap()
                .unwrap()
        };
    let old_card = register(&mut runtime, &old_launcher, old_id, None);
    assert_eq!(old_card.converter_version, "personal-converter/10");
    let duplicate = register(
        &mut runtime,
        &old_launcher,
        "00000000-0000-4000-8000-000000000013",
        None,
    );
    assert_eq!(duplicate.local_model_id, old_card.local_model_id);
    assert_eq!(duplicate.version, 1);
    assert_eq!(cards(&root).unwrap().len(), 1);
    let apply = |id: &str| {
        json!({"action":"apply","localModelId":id,"sourceHash":source_hash,
        "posePath":pose,"poseHash":pose_hash,"selectionId":"migration",
        "camera":{"version":"personal-camera/1","sourceBvhSha256":null,"rotation":null},
        "hands":{"left":null,"right":null}})
    };
    let old_applied = runtime
        .with_session(&old_launcher, &root, context(), |session, _| {
            session.request(None, "migration", &cancel, apply(old_id))
        })
        .unwrap();
    let old_export = root.join("user exports/v10 preserved.fbx");
    runtime.with_session(&old_launcher,&root,context(),|session,_| session.request(None,"migration",&cancel,
        json!({"action":"export","localModelId":old_id,"snapshotHash":old_applied["snapshotHash"],"destinationPath":old_export}))).unwrap();
    let old_export_hash = hash(&fs::read(&old_export).unwrap());
    // The production runtime cache switches launcher/profile; old worker model
    // metadata must fail before any v11 apply/cache result can be consumed.
    let stale = runtime.with_session(&new_launcher, &root, context(), |session, _| {
        session.request(None, "migration", &cancel, apply(old_id))
    });
    assert_eq!(stale.unwrap_err().code, "RUNTIME_MISMATCH");
    assert_eq!(
        card(&root, &old_card.local_model_id)
            .unwrap()
            .converter_version,
        "personal-converter/10"
    );
    assert_eq!(hash(&fs::read(&old_export).unwrap()), old_export_hash);
    // Explicit user re-registration invokes the exact core used by the picker:
    // preserve public ID/name/createdAt, increment version, change worker ID.
    let new_card = register(
        &mut runtime,
        &new_launcher,
        new_id,
        Some(&old_card.local_model_id),
    );
    assert_eq!(new_card.converter_version, "personal-converter/11");
    assert_ne!(
        new_card.converter_fingerprint,
        old_card.converter_fingerprint
    );
    assert_eq!(new_card.local_model_id, old_card.local_model_id);
    assert_eq!(new_card.name, old_card.name);
    assert_eq!(new_card.created_at, old_card.created_at);
    assert_eq!(new_card.version, 2);
    assert_eq!(new_card.worker_model_id, new_id);
    assert_eq!(cards(&root).unwrap().len(), 1);
    assert!(!root.join("worker/models").join(old_id).exists());
    assert!(root.join("worker/models").join(new_id).is_dir());
    let camera = json!({"version":"personal-camera/1","sourceBvhSha256":null,"rotation":null});
    assert!(validate_snapshot(&new_card, &pose_hash, &camera, &old_applied["snapshot"]).is_err());
    let new_applied = runtime
        .with_session(&new_launcher, &root, context(), |session, _| {
            session.request(None, "migration", &cancel, apply(new_id))
        })
        .unwrap();
    assert_eq!(new_applied["cacheHit"], false);
    assert_ne!(new_applied["snapshotHash"], old_applied["snapshotHash"]);
    assert!(validate_snapshot(&new_card, &pose_hash, &camera, &new_applied["snapshot"]).is_ok());
    let cached = runtime
        .with_session(&new_launcher, &root, context(), |session, _| {
            session.request(None, "migration", &cancel, apply(new_id))
        })
        .unwrap();
    assert_eq!(cached["cacheHit"], true);
    assert_eq!(cached["artifactHash"], new_applied["artifactHash"]);
    let stale_export = runtime.with_session(&new_launcher,&root,context(),|session,_|
        session.request(None,"migration",&cancel,json!({"action":"export","localModelId":new_id,
            "snapshotHash":old_applied["snapshotHash"],"destinationPath":root.join("user exports/stale.fbx")})));
    assert_eq!(stale_export.unwrap_err().code, "SNAPSHOT_MISMATCH");
    assert!(!root.join("user exports/stale.fbx").exists());
    let new_export = root.join("user exports/v11 saved.fbx");
    runtime
        .with_session(&new_launcher, &root, context(), |session, _| {
            session.request(
                None,
                "migration",
                &cancel,
                json!({"action":"export","localModelId":new_id,
            "snapshotHash":new_applied["snapshotHash"],"destinationPath":new_export}),
            )
        })
        .unwrap();
    let new_export_hash = hash(&fs::read(&new_export).unwrap());
    assert_eq!(new_export_hash, new_applied["artifactHash"]);
    runtime
        .with_session(&new_launcher, &root, context(), |session, _| {
            session.request(
                None,
                "migration",
                &cancel,
                json!({"action":"delete","localModelId":new_id}),
            )
        })
        .unwrap();
    runtime.clear();
    assert_eq!(hash(&fs::read(&old_export).unwrap()), old_export_hash);
    assert_eq!(hash(&fs::read(&new_export).unwrap()), new_export_hash);
    assert_eq!(hash(&fs::read(&source).unwrap()), source_hash);
    let report = json!({"allPassed":true,"sourceSha256":source_hash,"poseSha256":pose_hash,
        "v10Versions":{"converterVersion":old_card.converter_version,"converterFingerprint":old_card.converter_fingerprint},
        "v11Versions":{"converterVersion":new_card.converter_version,"converterFingerprint":new_card.converter_fingerprint},
        "v10ExportSha256":old_export_hash,"v11ExportSha256":new_export_hash,
        "v10SnapshotHash":old_applied["snapshotHash"],"v11SnapshotHash":new_applied["snapshotHash"],
        "sameRuntimeDuplicateReused":true,"oldWorkerRejected":true,"explicitReregistrationPassed":true,
        "cardVersionIncremented":true,"oldCardIdentityPreserved":true,"oldSnapshotRejected":true,
        "freshV11ApplyPassed":true,"v11CacheReusePassed":true,"deletionPreservesBothExports":true,
        "scope":"actual product native registration/replacement core and retained NDJSON adapter; offline recorded pose; no picker/UI/live BFF/CSP or geometry quality qualification"});
    fs::write(
        std::env::var("STANDIN_TEST_MIGRATION_REPORT").unwrap(),
        serde_json::to_vec_pretty(&report).unwrap(),
    )
    .unwrap();
}
