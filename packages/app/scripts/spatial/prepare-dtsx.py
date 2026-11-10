"""Extract the portable ACE path from a pinned DTSX_decoder source checkout."""

from hashlib import sha256
from pathlib import Path
import sys


def read_source(source, path, expected):
    data = (source / path).read_bytes()
    if sha256(data.replace(b"\r\n", b"\n")).hexdigest() != expected:
        raise SystemExit(f"Unexpected {path}. Use DTSX_decoder commit 5ba94ae7353ed57b04991f5dc2fdefc8865a1878.")
    return data.decode().replace("\r\n", "\n")


def prepare(source, output):
    # Only the internal ACE parser and synthesis, with no DLL, CLI, or renderer.
    lines = read_source(
        source, "src/io/p2_decoder.cpp",
        "7867aa5a0d6881e9b17b07eba3f26a7968dd21485862cc26eded3bc61bf86043",
    ).splitlines(keepends=True)

    def section(first, last):
        return "".join(lines[first - 1:last])

    parser = section(1692, 2597).replace("const dtsx::ElementaryFrame& frame", "const AcePacket& frame")
    begin = parser.index("        metadata_object_ids_.insert(")
    end = parser.index("        dtsx::AceFrameHeader main_ace_header;", begin)
    parser = parser[:begin] + """        // QQ 5.1 carries one full channel-based ACE chunk per MP4 sample.
        if (!uhd_header.full_channel_based_mix || uhd_header.major_version != 2U
            || uhd_header.frame_size != frame.bytes.size() || uhd_header.audio_chunks.size() != 1U
            || uhd_header.audio_chunks[0].id != 1U) {
            throw std::runtime_error("unsupported DTS-UHD presentation");
        }
        const auto activity_mask_for_chunk = [](std::uint32_t) {
            return std::pair<std::uint32_t, bool>{0x0FU, false}; // C, L/R, Ls/Rs, LFE.
        };
        const auto is_object_audio_chunk = [](std::uint32_t) { return false; };
        const std::array<const dtsx::UhdChunk*, 1> selected_chunks{&uhd_header.audio_chunks[0]};
""" + parser[end:]
    parser = parser.replace("        assemble_aggregate_temporal_hole_fill_state();\n", "")
    parser = parser.replace(
        "                        if (spectral_ok) {\n",
        """                        if (spectral_ok) {
                            // Prediction uses the previous frame's final log norms.
                            for (auto channel = prefix.first_effective_channel;
                                 channel < prefix.first_effective_channel + prefix.effective_channel_count;
                                 ++channel) {
                                next.primary_lognorm_q10[channel] = spectral.finalized_lognorm_q10[channel];
                            }
""",
    )
    helpers = section(295, 323) + section(358, 553)
    helpers = helpers.replace('    const char* value = std::getenv("DTSX_P2_NATIVE_MDCT_CANDIDATE");\n'
                              "    return value != nullptr && value[0] == '1';", "    return false;")
    helpers = helpers.replace(
        "bool apply_internal_lts(\n    dtsx::AceLtsHistory& state,",
        """struct AceLtsChannel {
    dtsx::AceLtsHistory history;
    bool enabled = false;
    std::uint32_t lag = 0;
    std::uint32_t filter_index = 0;
};

bool apply_internal_lts(
    AceLtsChannel& state,""",
    ).replace(
        "    return dtsx::ace_lts_process_f32(state, samples, enabled, lag, filter_index);",
        """    // MDCT emits the previous access unit after overlapping its tail.
    const bool ok = dtsx::ace_lts_process_f32(
        state.history, samples, state.enabled, state.lag, state.filter_index);
    state.enabled = enabled;
    state.lag = lag;
    state.filter_index = filter_index;
    return ok;""",
    )
    state = section(2620, 2636) + section(2641, 2645) + section(2649, 2652)
    state += section(2663, 2663) + section(2671, 2672)
    state = state.replace("dtsx::AceLtsHistory>", "AceLtsChannel>")
    (output / "dtsx-ace.inc").write_text(
        "// Derived from DTSX_decoder. Required Notice: Copyright (c) 2026 almirus\n"
        + section(6, 10) + section(13, 16) + section(26, 47)
        + "\nnamespace {\n" + helpers
        + "\nstruct AcePacket { std::vector<std::uint8_t> bytes; };\n"
        + "class AceDecoder {\npublic:\n" + section(581, 642) + parser + state + "};\n}\n"
    )

    uhd = read_source(
        source, "src/dtsx/uhd_frame.cpp",
        "e25d2be1f84a0fd1a6c2ae2c81d9ca1c8bd455715dbe9d5ff08371a592c21bb2",
    )
    # PBR smoothing is for reassembling XLL. A complete ACE chunk already
    # occupies the rest of its MP4 sample, so do not parse XLL smoothing bits.
    # The upstream CRC and complete chunk-size checks still apply.
    uhd = uhd.replace(
        """|| !read_pbr_smoothing(
            source, header.sync_frame, next_state)""",
        """|| (!(header.full_channel_based_mix && header.audio_chunks.size() == 1U
              && header.audio_chunks.front().id == 1U && payload_size == bytes.size())
            && !read_pbr_smoothing(source, header.sync_frame, next_state))""",
    )
    (output / "uhd_frame.cpp").write_text(uhd)

    mdct = read_source(
        source, "src/dtsx/ace_mdct.cpp",
        "bef826db1b2a43a6aa02928973da94b530b89c0622c0c027274d962ac85f7584",
    )
    start = mdct.index("    // Closed-form DCT-IV")
    stop = mdct.index("\n}", start)
    # The ACE spectral ordering expects the native Walsh/rotation pipeline.
    (output / "ace_mdct.cpp").write_text(mdct[:start] + """    std::uint32_t exponent = 0U;
    scaled.resize(1024U, 0.0F);
    if (!ace_mdct_set_window_size(transform_size, exponent)
        || !ace_mdct_native_transform_f32(scaled, exponent)) {
        samples.clear();
        return false;
    }
    scaled.resize(transform_size);
    samples = std::move(scaled);
    return true;""" + mdct[stop:])

    spectral = read_source(
        source, "src/dtsx/ace_spectral_payload.cpp",
        "7f3407ef99cf366a0166e235d9f50cfc5d1f7ff5731fb19f072279e38b5d0d7f",
    )
    # Seed the running balance with the bits left after primary allocation.
    spectral = spectral.replace(
        "prefix.num_coded_bands, 0U, 0U, 0,",
        """prefix.num_coded_bands, 0U, 0U,
        static_cast<std::int32_t>(prefix.allocation_available_bits)
            - static_cast<std::int32_t>(prefix.allocation_total_bits),""",
    )
    start = spectral.index("                // Native ProcessOneBand is invoked with a8=1;")
    stop = spectral.index("log_n, 0U,", start)
    spectral = spectral[:start] + "                1U, " + spectral[stop:]
    # Recursive vector splits decode their ratio according to the band's time slots.
    spectral = spectral.replace("1U, log_n, 0U,", "prefix.band_block_count[band], log_n, 0U,")
    # Each reverse Haar stage doubles the time slots. Mode -1 needs one stage.
    spectral = spectral.replace("const std::int32_t limit = -mode < 2 ? 2 : -mode;",
                                "const std::int32_t limit = -mode;")
    (output / "ace_spectral_payload.cpp").write_text(spectral)

    vq = read_source(
        source, "src/dtsx/ace_vq.cpp",
        "cde9a9136df19ab5881b5a19dc8c2236cd7944f19e224339f3335f3bbe958a34",
    )
    vq = vq.replace(
        "return allocated_bits > kMaxBitsForN[components - 2U];",
        """return allocated_bits > (!high_resolution && components <= 6U
        ? detail::kAceLowResolutionMaxBits[components - 2U]
        : kMaxBitsForN[components - 2U]);""",
    )
    # A partition with fewer than two bits carries no signed pulse.
    vq = vq.replace("partition_bits == 0U || band_bits == 0U",
                    "partition_bits < 2U || band_bits < 2U")
    (output / "ace_vq.cpp").write_text(vq)

    bit_reader = read_source(
        source, "src/dtsx/ace_bit_reader.cpp",
        "5f31a92416742853de5e18b25acc99e227a96bd6d66e98895bcbe7937d5869b5",
    )
    # Unsigned pyramid alphabets can require 32 bits.
    (output / "ace_bit_reader.cpp").write_text(bit_reader.replace(
        "(std::uint32_t{1U} << width) - alphabet",
        "static_cast<std::uint32_t>((std::uint64_t{1U} << width) - alphabet)",
    ))


if __name__ == "__main__":
    prepare(Path(sys.argv[1]), Path(sys.argv[2]))
