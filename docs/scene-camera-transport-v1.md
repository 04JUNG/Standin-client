# Saved scene camera metadata

The client negotiates `scene-camera-artifact-v1` on scene manifest requests. It
accepts the old unavailable state as well as a verified available recipe, and
checks the latter against the downloaded FBX SHA, original image dimensions and
camera optics. New metadata does not authorize a different file or included person.

The existing native atomic FBX/`.scene.json` save now preserves the available
recipe. After actual save, the app and floating bar expose the camera position,
focal point, perspective and source dimensions from that same receipt. These are
calculated values from the compiler, not per-cut manual offsets. A malformed
recipe or false automatic-application claim cannot be saved as accepted metadata.

No CSP automation, hard-coded screen clicks or guessed document zoom is added.
The UI continues to say automatic CSP connection is unsupported and CSP framing
is unverified. Applying these numbers to an arbitrary existing CSP canvas is not
equivalent to importing its FBX. Screen crop coordinates alone do not determine
document canvas coordinates; a verified document/viewport mapping and camera
adapter are still required for automatic exact overlay.

The new BFF protects older clients by only emitting the available-camera shape
after explicit negotiation. Older BFFs/Converters remain usable and return the
unavailable state. Roll out the coordinated BFF change with this client before
claiming camera data is available in saved sidecars.
