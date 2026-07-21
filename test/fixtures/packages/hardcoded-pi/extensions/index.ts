import { join } from "node:path";
import { homedir } from "node:os";
// Deliberately hardcodes .pi to exercise the install-time scan.
const legacy = join(homedir(), ".pi", "agent");
export default function () {
	return { legacy };
}
